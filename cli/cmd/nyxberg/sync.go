package main

import (
	"bytes"
	"compress/zlib"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

type remote struct{ URL, ID, Ref, Token string }
type refInfo struct {
	GitRef      string  `json:"gitRef"`
	DisplayName string  `json:"displayName"`
	HeadOID     *string `json:"headOid"`
	Generation  int     `json:"generation"`
	Kind        string  `json:"kind"`
}
type objectInfo struct {
	OID      string `json:"oid"`
	SHA256   string `json:"sha256"`
	Size     int    `json:"size"`
	URL      string `json:"url,omitempty"`
	Checksum string `json:"checksum,omitempty"`
}
type snapshot struct {
	HeadOID    *string      `json:"headOid"`
	Generation int          `json:"generation"`
	Objects    []objectInfo `json:"objects"`
}

var oidRE = regexp.MustCompile(`^[a-f0-9]{40}$`)
var uuidRE = regexp.MustCompile(`^[a-fA-F0-9-]{36}$`)
var httpClient = &http.Client{Timeout: 60 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error { return errors.New("redirect rejected") }}

func apiURL(raw string) (string, error) {
	u, err := url.Parse(strings.TrimRight(raw, "/"))
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" {
		return "", errors.New("invalid server URL")
	}
	if u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1")) {
		return "", errors.New("server must use HTTPS (HTTP is allowed only on localhost)")
	}
	return u.String(), nil
}
func (r remote) call(method, path string, body any, out any) error {
	var b io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		b = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, r.URL+path, b)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if r.Token != "" {
		req.Header.Set("Authorization", "Bearer "+r.Token)
	}
	res, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if err != nil {
		return err
	}
	if res.StatusCode >= 300 {
		return fmt.Errorf("server returned %s: %s", res.Status, strings.TrimSpace(string(data)))
	}
	if out != nil {
		return json.Unmarshal(data, out)
	}
	return nil
}
func loadRemote() (remote, error) {
	server, _ := gitOutput("config", "--local", "--get", "nyxberg.url")
	id, _ := gitOutput("config", "--local", "--get", "nyxberg.repo")
	ref, _ := gitOutput("config", "--local", "--get", "nyxberg.ref")
	base, err := apiURL(server)
	if err != nil || !uuidRE.MatchString(id) || ref == "" {
		return remote{}, errors.New("repository not linked; use Configure connection first")
	}
	return remote{base, id, ref, os.Getenv("NYXBERG_TOKEN")}, nil
}
func configure() {
	raw := prompt("Server URL (https://...) ")
	base, err := apiURL(raw)
	if err != nil {
		fmt.Println(" ", err)
		return
	}
	id := prompt("Repository ID")
	if !uuidRE.MatchString(id) {
		fmt.Println("  Invalid repository ID.")
		return
	}
	ref := prompt("Branch display name (blank = mainyaww:3)")
	if ref == "" {
		ref = "mainyaww:3"
	}
	r := remote{base, id, ref, os.Getenv("NYXBERG_TOKEN")}
	if _, err := r.refs(); err != nil {
		fmt.Println("  Could not connect:", err)
		return
	}
	for _, pair := range [][2]string{{"nyxberg.url", base}, {"nyxberg.repo", id}, {"nyxberg.ref", ref}} {
		if err := runGit("config", "--local", pair[0], pair[1]); err != nil {
			fmt.Println("  Could not save connection:", err)
			return
		}
	}
	fmt.Println("  Repository linked. Tokens are read from NYXBERG_TOKEN, never stored here.")
}
func (r remote) refs() ([]refInfo, error) {
	var response struct {
		Data []refInfo `json:"data"`
	}
	err := r.call("GET", "/api/v1/repos/"+r.ID+"/refs", nil, &response)
	return response.Data, err
}
func (r remote) ref() (refInfo, error) {
	refs, err := r.refs()
	if err != nil {
		return refInfo{}, err
	}
	for _, v := range refs {
		if v.DisplayName == r.Ref || v.GitRef == r.Ref {
			return v, nil
		}
	}
	return refInfo{}, errors.New("branch not found on server")
}
func (r remote) snapshot() (snapshot, error) {
	var s snapshot
	err := r.call("GET", "/api/v1/repos/"+r.ID+"/objects?ref="+url.QueryEscape(r.Ref), nil, &s)
	return s, err
}
func syncMenu() {
	fmt.Println("\n  1  Configure connection\n  2  Push committed changes\n  3  Pull (fast-forward only)\n  4  Smart Sync (stage, commit, push)\n  0  Back")
	switch prompt("Choose") {
	case "1":
		configure()
	case "2":
		r, e := loadRemote()
		if e == nil {
			e = r.push()
		}
		if e != nil {
			fmt.Println("  Push failed:", e)
		}
	case "3":
		r, e := loadRemote()
		if e == nil {
			e = r.pull()
		}
		if e != nil {
			fmt.Println("  Pull failed:", e)
		}
	case "4":
		status, e := gitOutput("status", "--porcelain")
		if e != nil {
			fmt.Println("  Cannot inspect working tree.")
			return
		}
		if status != "" {
			stage()
			commit()
			remaining, err := gitOutput("status", "--porcelain")
			if err != nil || (remaining != "" && prompt("Working tree still has changes. Type yes to push committed work") != "yes") {
				return
			}
		}
		r, e := loadRemote()
		if e == nil {
			e = r.push()
		}
		if e != nil {
			fmt.Println("  Sync failed:", e)
		}
	}
}

type transferState struct {
	Server   string          `json:"server"`
	Repo     string          `json:"repo"`
	Ref      string          `json:"ref"`
	Head     string          `json:"head"`
	Manifest string          `json:"manifest"`
	ID       string          `json:"id"`
	Done     map[string]bool `json:"done"`
}

func saveTransfer(path string, state transferState) error {
	b, err := json.Marshal(state)
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0600)
}
func (r remote) push() error {
	if r.Token == "" {
		return errors.New("set NYXBERG_TOKEN to an admin token")
	}
	ref, err := r.ref()
	if err != nil {
		return err
	}
	head, err := gitOutput("rev-parse", "--verify", "HEAD^{commit}")
	if err != nil || !oidRE.MatchString(head) {
		return errors.New("a SHA-1 Git commit is required")
	}
	format, err := gitOutput("rev-parse", "--show-object-format")
	if err != nil || format != "sha1" {
		return errors.New("only SHA-1 Git repositories are currently supported")
	}
	if ref.HeadOID != nil && *ref.HeadOID == head {
		if statePath, e := gitOutput("rev-parse", "--git-path", "nyxberg-transfer.json"); e == nil {
			_ = os.Remove(statePath)
		}
		fmt.Println("  Already synchronized.")
		return nil
	}
	output, err := gitOutput("rev-list", "--objects", "--no-object-names", head)
	if err != nil {
		return err
	}
	ids := strings.Fields(output)
	if len(ids) > 256 {
		return errors.New("repository exceeds the current limit of 256 reachable objects")
	}
	objects := make([]objectInfo, 0, len(ids))
	payloads := map[string][]byte{}
	total := 0
	for _, id := range ids {
		if !oidRE.MatchString(id) {
			return errors.New("invalid Git object ID")
		}
		typ, err := gitOutput("cat-file", "-t", id)
		if err != nil {
			return err
		}
		content, err := exec.Command("git", "cat-file", typ, id).Output()
		if err != nil {
			return err
		}
		if len(content) > 4*1024*1024 {
			return errors.New("object exceeds 4 MiB verification limit")
		}
		raw := append([]byte(fmt.Sprintf("%s %d\x00", typ, len(content))), content...)
		if fmt.Sprintf("%x", sha1.Sum(raw)) != id {
			return errors.New("local object ID mismatch")
		}
		var compressed bytes.Buffer
		zw := zlib.NewWriter(&compressed)
		if _, err = zw.Write(raw); err != nil {
			return err
		}
		if err = zw.Close(); err != nil {
			return err
		}
		data := compressed.Bytes()
		total += len(data)
		if total > 32*1024*1024 {
			return errors.New("transfer exceeds 32 MiB limit")
		}
		sum := sha256.Sum256(data)
		objects = append(objects, objectInfo{OID: id, SHA256: hex.EncodeToString(sum[:]), Size: len(data)})
		payloads[id] = data
	}
	fmt.Printf("  Push %d objects (%d bytes) to %s?\n", len(objects), total, ref.DisplayName)
	if prompt("Type yes to confirm") != "yes" {
		return nil
	}

	statePath, err := gitOutput("rev-parse", "--git-path", "nyxberg-transfer.json")
	if err != nil {
		return err
	}
	encoded, _ := json.Marshal(objects)
	manifestHash := fmt.Sprintf("%x", sha256.Sum256(encoded))
	state := transferState{Server: r.URL, Repo: r.ID, Ref: ref.GitRef, Head: head, Manifest: manifestHash, Done: map[string]bool{}}
	var reply struct {
		TransferID string       `json:"transferId"`
		Uploads    []objectInfo `json:"uploads"`
		Status     string       `json:"status"`
	}
	if old, e := os.ReadFile(statePath); e == nil {
		var saved transferState
		if json.Unmarshal(old, &saved) == nil && saved.Server == r.URL && saved.Repo == r.ID && saved.Ref == ref.GitRef && saved.Head == head && saved.Manifest == manifestHash && uuidRE.MatchString(saved.ID) {
			fmt.Println("  Resuming interrupted transfer:", saved.ID)
			state = saved
			if state.Done == nil {
				state.Done = map[string]bool{}
			}
			err = r.call("POST", "/api/v1/repos/"+r.ID+"/sync/resume", map[string]string{"transferId": state.ID}, &reply)
			if err != nil {
				fmt.Println("  Cannot resume:", err)
				if prompt("Type yes to start a new transfer") != "yes" {
					return err
				}
				state.ID = ""
				state.Done = map[string]bool{}
			}
		} else {
			fmt.Println("  A previous transfer does not match this commit.")
			if prompt("Type yes to replace its local progress record") != "yes" {
				return errors.New("previous transfer retained")
			}
		}
	}
	if state.ID == "" {
		err = r.call("POST", "/api/v1/repos/"+r.ID+"/sync/negotiate", map[string]any{"gitRef": ref.GitRef, "expectedHeadOid": ref.HeadOID, "expectedGeneration": ref.Generation, "newHeadOid": head, "objects": objects}, &reply)
		if err != nil {
			return err
		}
		state.ID = reply.TransferID
		if err = saveTransfer(statePath, state); err != nil {
			return fmt.Errorf("could not save transfer progress: %w", err)
		}
	}
	if reply.Status == "COMMITTED" {
		_ = os.Remove(statePath)
		fmt.Println("  Transfer already committed.")
		return nil
	}
	if len(reply.Uploads) != len(objects) {
		return errors.New("incomplete upload manifest")
	}
	seen := map[string]bool{}
	for i, item := range reply.Uploads {
		data, ok := payloads[item.OID]
		if !ok || seen[item.OID] {
			return errors.New("unexpected upload object")
		}
		seen[item.OID] = true
		if state.Done[item.OID] {
			fmt.Printf("\r  Uploading %d/%d", i+1, len(reply.Uploads))
			continue
		}
		req, err := http.NewRequest("PUT", item.URL, bytes.NewReader(data))
		if err != nil {
			return err
		}
		req.Header.Set("x-amz-checksum-sha256", item.Checksum)
		res, err := httpClient.Do(req)
		if err != nil {
			return err
		}
		res.Body.Close()
		if res.StatusCode < 200 || res.StatusCode >= 300 {
			return fmt.Errorf("upload failed: %s; retry to resume", res.Status)
		}
		state.Done[item.OID] = true
		if err = saveTransfer(statePath, state); err != nil {
			return fmt.Errorf("could not save progress: %w", err)
		}
		fmt.Printf("\r  Uploading %d/%d", i+1, len(reply.Uploads))
	}
	fmt.Println("\n  Verifying objects and publishing branch…")
	var complete map[string]any
	if err = r.call("POST", "/api/v1/repos/"+r.ID+"/sync/complete", map[string]string{"transferId": state.ID}, &complete); err != nil {
		return err
	}
	_ = os.Remove(statePath)

	fmt.Println("  Push complete:", head)
	return nil
}
func verifyLoose(data []byte, oid string) error {
	zr, err := zlib.NewReader(bytes.NewReader(data))
	if err != nil {
		return err
	}
	raw, err := io.ReadAll(io.LimitReader(zr, 4*1024*1024+101))
	_ = zr.Close()
	if err != nil || len(raw) > 4*1024*1024+100 || fmt.Sprintf("%x", sha1.Sum(raw)) != oid {
		return errors.New("Git object integrity check failed")
	}
	return nil
}
func (r remote) fetch() (string, error) {
	s, err := r.snapshot()
	if err != nil {
		return "", err
	}
	if s.HeadOID == nil || !oidRE.MatchString(*s.HeadOID) {
		return "", errors.New("remote branch is empty or invalid")
	}
	if len(s.Objects) > 256 {
		return "", errors.New("remote object manifest exceeds limit")
	}
	objectDir, err := gitOutput("rev-parse", "--git-path", "objects")
	if err != nil {
		return "", err
	}
	seen := map[string]bool{}
	for i, item := range s.Objects {
		if !oidRE.MatchString(item.OID) || seen[item.OID] || item.Size < 1 || item.Size > 4*1024*1024 {
			return "", errors.New("invalid object manifest")
		}
		seen[item.OID] = true
		dir := filepath.Join(objectDir, item.OID[:2])
		dest := filepath.Join(dir, item.OID[2:])
		if existing, e := os.ReadFile(dest); e == nil {
			if verifyLoose(existing, item.OID) != nil {
				return "", errors.New("existing local Git object is corrupt")
			}
			fmt.Printf("\r  Downloading %d/%d", i+1, len(s.Objects))
			continue
		} else if !os.IsNotExist(e) {
			return "", e
		}
		res, err := httpClient.Get(item.URL)
		if err != nil {
			return "", err
		}
		if res.StatusCode == http.StatusForbidden {
			res.Body.Close()
			fresh, e := r.snapshot()
			if e != nil || fresh.HeadOID == nil || *fresh.HeadOID != *s.HeadOID {
				return "", errors.New("remote branch changed while downloading")
			}
			found := false
			for _, f := range fresh.Objects {
				if f.OID == item.OID && f.SHA256 == item.SHA256 && f.Size == item.Size {
					item.URL = f.URL
					found = true
					break
				}
			}
			if !found {
				return "", errors.New("object manifest changed while downloading")
			}
			res, err = httpClient.Get(item.URL)
			if err != nil {
				return "", err
			}
		}
		if res.StatusCode != 200 {
			res.Body.Close()
			return "", fmt.Errorf("object download failed: %s", res.Status)
		}
		data, err := io.ReadAll(io.LimitReader(res.Body, int64(item.Size)+1))
		res.Body.Close()
		if err != nil || len(data) != item.Size {
			return "", errors.New("object download incomplete")
		}
		sum := sha256.Sum256(data)
		if hex.EncodeToString(sum[:]) != item.SHA256 {
			return "", errors.New("storage checksum mismatch")
		}
		if err = verifyLoose(data, item.OID); err != nil {
			return "", err
		}
		if err = os.MkdirAll(dir, 0755); err != nil {
			return "", err
		}
		file, err := os.CreateTemp(dir, ".nyxberg-*")
		if err != nil {
			return "", err
		}
		tmp := file.Name()
		_, err = file.Write(data)
		if closeErr := file.Close(); err == nil {
			err = closeErr
		}
		if err == nil {
			err = os.Rename(tmp, dest)
		}
		if err != nil {
			os.Remove(tmp)
			return "", err
		}
		fmt.Printf("\r  Downloading %d/%d", i+1, len(s.Objects))
	}
	fmt.Println()
	if err := exec.Command("git", "cat-file", "-e", *s.HeadOID+"^{commit}").Run(); err != nil {
		return "", errors.New("remote commit not available")
	}
	refs, err := r.refs()
	if err == nil {
		for _, ref := range refs {
			if ref.Kind != "TAG" || ref.HeadOID == nil || !oidRE.MatchString(*ref.HeadOID) || !strings.HasPrefix(ref.GitRef, "refs/tags/") {
				continue
			}
			if exec.Command("git", "check-ref-format", ref.GitRef).Run() != nil || exec.Command("git", "cat-file", "-e", *ref.HeadOID+"^{commit}").Run() != nil {
				continue
			}
			_ = exec.Command("git", "update-ref", ref.GitRef, *ref.HeadOID, strings.Repeat("0", 40)).Run()
		}
	}
	return *s.HeadOID, nil
}
func (r remote) pull() error {
	status, err := gitOutput("status", "--porcelain")
	if err != nil {
		return err
	}
	if status != "" {
		return errors.New("working tree is not clean; commit or stash your changes first")
	}
	head, err := r.fetch()
	if err != nil {
		return err
	}
	fmt.Println("  Applying fast-forward to", head)
	if err = runGit("merge", "--ff-only", head); err != nil {
		return errors.New("fast-forward failed; review the divergent history manually")
	}
	return nil
}
func cloneRepo() {
	base, err := apiURL(prompt("Server URL (https://...)"))
	if err != nil {
		fmt.Println(" ", err)
		return
	}
	id := prompt("Repository ID")
	if !uuidRE.MatchString(id) {
		fmt.Println("  Invalid repository ID.")
		return
	}
	ref := prompt("Branch display name (blank = mainyaww:3)")
	if ref == "" {
		ref = "mainyaww:3"
	}
	r := remote{base, id, ref, os.Getenv("NYXBERG_TOKEN")}
	remoteRef, err := r.ref()
	if err != nil || remoteRef.HeadOID == nil || remoteRef.Kind != "BRANCH" {
		fmt.Println("  Branch is unavailable or empty.")
		return
	}
	destination := prompt("New directory name")
	if destination == "" {
		return
	}
	if _, err = os.Lstat(destination); !os.IsNotExist(err) {
		fmt.Println("  Destination already exists or is inaccessible.")
		return
	}
	fmt.Printf("  Clone %s into %s?\n", ref, destination)
	if prompt("Type yes to confirm") != "yes" {
		return
	}
	if err = os.Mkdir(destination, 0755); err != nil {
		fmt.Println("  Cannot create destination:", err)
		return
	}
	old, err := os.Getwd()
	if err != nil {
		return
	}
	if err = os.Chdir(destination); err != nil {
		return
	}
	success := false
	defer func() {
		if !success {
			_ = os.Chdir(old)
		}
	}()
	if err = runGit("init", "--object-format=sha1"); err != nil {
		fmt.Println("  Git initialization failed:", err)
		return
	}
	for _, pair := range [][2]string{{"nyxberg.url", base}, {"nyxberg.repo", id}, {"nyxberg.ref", ref}} {
		if err = runGit("config", "--local", pair[0], pair[1]); err != nil {
			fmt.Println("  Configuration failed:", err)
			return
		}
	}
	head, err := r.fetch()
	if err != nil {
		fmt.Println("  Download failed:", err)
		return
	}
	if err = runGit("symbolic-ref", "HEAD", remoteRef.GitRef); err != nil {
		fmt.Println("  Invalid branch:", err)
		return
	}
	if err = runGit("reset", "--hard", head); err != nil {
		fmt.Println("  Checkout failed:", err)
		return
	}
	success = true
	fmt.Println("  Clone complete.")
}
