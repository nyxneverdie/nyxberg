package main

import "testing"

func TestAliasRoundTrip(t *testing.T) {
	for _, name := range []string{"mainyaww:3", "hello world", "東京", "a/b"} {
		ref := branchRef(name)
		if got := displayBranch(ref[len("refs/heads/"):]); got != name {
			t.Fatalf("%q != %q", got, name)
		}
	}
}

func TestServerURLPolicy(t *testing.T) {
	for _, tc := range []struct {
		input string
		ok    bool
	}{
		{"https://example.com", true}, {"http://localhost:3000", true}, {"http://127.0.0.1:3000", true},
		{"http://example.com", false}, {"https://user:pass@example.com", false}, {"https://example.com/path", false},
	} {
		_, err := apiURL(tc.input)
		if (err == nil) != tc.ok {
			t.Errorf("apiURL(%q): %v", tc.input, err)
		}
	}
}
