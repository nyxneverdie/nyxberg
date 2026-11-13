package main

import (
	"bufio"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

const version = "1.0.0-beta.1"

var input = bufio.NewReader(os.Stdin)

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "--version":
			fmt.Println("nyxberg " + version)
			return
		case "--help", "-h":
			fmt.Println("NyxBerg: run nyxberg to open the interactive menu.\nOptions: --help, --version, --diagnose")
			return
		case "--diagnose":
			diagnose()
			return
		default:
			fmt.Fprintln(os.Stderr, "Unknown argument. Run nyxberg --help.")
			os.Exit(2)
		}
	}
	if _, err := exec.LookPath("git"); err != nil {
		fmt.Fprintln(os.Stderr, "Git is required. Install Git and try again.")
		os.Exit(1)
	}
	for {
		fmt.Print("\n  ✳ NYXBERG  /  A LITTLE HOME FOR GOOD CODE :3\n  ─────────────────────────────────────────────\n")
		root, err := gitOutput("rev-parse", "--show-toplevel")
		if err != nil {
			fmt.Println("  No Git repository detected.\n\n  1  Initialize a repository\n  2  Clone a repository\n  0  Quit")
			switch prompt("Choose") {
			case "1":
				initialize()
			case "2":
				cloneRepo()
			case "0", "q", "Q":
				return
			}
			continue
		}
		branch, _ := gitOutput("branch", "--show-current")
		status, _ := gitOutput("status", "--short")
		count := 0
		if status != "" {
			count = len(strings.Split(status, "\n"))
		}
		fmt.Printf("  Repository: %s\n  Branch: %s   ·   %d changed\n\n", filepath.Base(root), displayBranch(branch), count)
		fmt.Println("  1  Working tree & stage files\n  2  Commit changes\n  3  Branches & history\n  4  Smart Sync / push / pull\n  5  Contribute & tools\n  0  Quit")
		switch prompt("Choose") {
		case "1":
			stage()
		case "2":
			commit()
		case "3":
			branches()
		case "4":
			syncMenu()
		case "5":
			unavailable()
		case "0", "q", "Q":
			return
		}
	}
}
func prompt(label string) string {
	fmt.Printf("\n  %s: ", label)
	line, err := input.ReadString('\n')
	if err != nil && len(line) == 0 {
		fmt.Println()
		os.Exit(0)
	}
	return strings.TrimSpace(line)
}
func gitOutput(args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	out, err := cmd.Output()
	return strings.TrimSpace(string(out)), err
}
func runGit(args ...string) error {
	cmd := exec.Command("git", args...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
func diagnose() {
	path, err := exec.LookPath("git")
	if err != nil {
		fmt.Println("Git: not installed")
		return
	}
	fmt.Println("Git:", path)
	root, err := gitOutput("rev-parse", "--show-toplevel")
	if err != nil {
		fmt.Println("Repository: none")
	} else {
		fmt.Println("Repository:", root)
	}
	fmt.Println("Remote transport: NyxBerg object protocol (SHA-1, bounded transfers)")
}
func initialize() {
	fmt.Println("\n  Initialize Git in the current directory?")
	if prompt("Type yes to confirm") != "yes" {
		return
	}
	if err := runGit("init"); err != nil {
		fmt.Println("  Could not initialize repository.")
	}
}
func stage() {
	out, err := exec.Command("git", "status", "--porcelain=v1", "-z", "--untracked-files=all").Output()
	if err != nil {
		fmt.Println("  Could not read status.")
		return
	}
	entries := strings.Split(string(out), "\x00")
	paths := []string{}
	for i := 0; i < len(entries); i++ {
		entry := entries[i]
		if len(entry) < 4 {
			continue
		}
		code, path := entry[:2], entry[3:]
		paths = append(paths, path)
		fmt.Printf("  %d  %s  %s\n", len(paths), code, path)
		if strings.ContainsAny(code, "RC") {
			i++
		}
	}
	if len(paths) == 0 {
		fmt.Println("  Working tree is clean.")
		return
	}
	fmt.Println("\n  Enter a number to stage one file, or 'all' to stage all changes.")
	selection := prompt("Selection (blank to cancel)")
	if selection == "" {
		return
	}
	if selection == "all" {
		if prompt("Type yes to stage all changes") != "yes" {
			return
		}
		if err := runGit("add", "-A"); err != nil {
			fmt.Println("  Staging failed.")
		}
		return
	}
	n, err := strconv.Atoi(selection)
	if err != nil || n < 1 || n > len(paths) {
		fmt.Println("  Invalid selection.")
		return
	}
	if err = runGit("add", "-A", "--", paths[n-1]); err != nil {
		fmt.Println("  Staging failed.")
	}
}
func commit() {
	staged, err := gitOutput("diff", "--cached", "--stat")
	if err != nil || staged == "" {
		fmt.Println("  No staged changes. Stage files first.")
		return
	}
	fmt.Println("\n" + staged)
	message := prompt("Commit message (blank to cancel)")
	if message == "" {
		return
	}
	if prompt("Type yes to create commit") != "yes" {
		return
	}
	if err := runGit("commit", "-m", message); err != nil {
		fmt.Println("  Commit failed. Check your Git identity and staged changes.")
	}
}
func branches() {
	fmt.Println("\n  1  Show branches\n  2  Create branch with display alias\n  3  Recent history\n  0  Back")
	switch prompt("Choose") {
	case "1":
		runGit("branch", "--list")
	case "2":
		name := prompt("Display name (blank to cancel)")
		if name == "" {
			return
		}
		ref := branchRef(name)
		if err := exec.Command("git", "check-ref-format", ref).Run(); err != nil {
			fmt.Println("  Invalid branch name.")
			return
		}
		fmt.Printf("  Display: %s\n  Git ref: %s\n", name, ref)
		if prompt("Type yes to create and switch") != "yes" {
			return
		}
		if err := runGit("switch", "-c", strings.TrimPrefix(ref, "refs/heads/")); err != nil {
			fmt.Println("  Could not create branch.")
		}
	case "3":
		runGit("--no-pager", "log", "--oneline", "--decorate", "-20")
	}
}
func branchRef(name string) string {
	return "refs/heads/nyxb/" + base64.RawURLEncoding.EncodeToString([]byte(name))
}
func displayBranch(name string) string {
	if strings.HasPrefix(name, "nyxb/") {
		decoded, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(name, "nyxb/"))
		if err == nil {
			return string(decoded)
		}
	}
	return name
}
func unavailable() {
	fmt.Println("\n  This feature is not available yet. Your local Git data has not been changed.")
}
