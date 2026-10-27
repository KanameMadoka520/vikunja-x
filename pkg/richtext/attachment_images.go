// Vikunja is a to-do list application to facilitate your life.
// Copyright 2018-present Vikunja and contributors. All rights reserved.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

package richtext

import (
	"errors"
	"io"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"golang.org/x/net/html"
)

var attachmentImagePath = regexp.MustCompile(`^(?:/api/v[12])?/tasks/([0-9]+)/attachments/([0-9]+)(?:/preview)?/?$`)

// FilterAttachmentImages edits only matching image tags, preserving all other
// source bytes (text, links, formatting and external images) unchanged.
func FilterAttachmentImages(source, publicURL string, remove func(taskID, attachmentID int64) bool) string {
	base, err := url.Parse(publicURL)
	if err != nil {
		return source
	}
	z := html.NewTokenizer(strings.NewReader(source))
	var out strings.Builder
	for {
		kind := z.Next()
		if kind == html.ErrorToken {
			if !errors.Is(z.Err(), io.EOF) {
				return source
			}
			break
		}
		raw := string(z.Raw())
		if kind == html.StartTagToken || kind == html.SelfClosingTagToken {
			token := z.Token()
			if token.Data == "img" {
				var src, data string
				for _, attr := range token.Attr {
					if attr.Key == "src" {
						src = attr.Val
					}
					if attr.Key == "data-src" {
						data = attr.Val
					}
				}
				if data != "" {
					src = data
				}
				u, parseErr := url.Parse(src)
				if parseErr == nil && u.User == nil && (u.Scheme == "" || u.Scheme == "http" || u.Scheme == "https") && (u.Host == "" || strings.EqualFold(u.Host, base.Host)) {
					path := u.Path
					prefix := strings.TrimRight(base.Path, "/")
					if prefix != "" {
						path = strings.TrimPrefix(path, prefix)
					}
					match := attachmentImagePath.FindStringSubmatch(path)
					if match != nil {
						tid, e1 := strconv.ParseInt(match[1], 10, 64)
						aid, e2 := strconv.ParseInt(match[2], 10, 64)
						if e1 == nil && e2 == nil && tid > 0 && aid > 0 && remove(tid, aid) {
							continue
						}
					}
				}
			}
		}
		out.WriteString(raw)
	}
	return out.String()
}
