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
	"testing"

	"github.com/stretchr/testify/assert"
)

//nolint:gosmopolitan // Verify that multilingual user content is preserved byte for byte.
func TestFilterAttachmentImages(t *testing.T) {
	for _, tag := range []string{
		`<img data-src="https://task.test/api/v2/tasks/7/attachments/5" src="#">`,
		`<img src='/api/v1/tasks/7/attachments/5/preview?size=medium' alt='a > b'/>`,
		`<IMG src="/tasks/7/attachments/5">`,
	} {
		source := `<p>保留 &amp; text</p>` + tag + `<a href="/api/v2/tasks/7/attachments/5">link</a>`
		assert.Equal(t, `<p>保留 &amp; text</p><a href="/api/v2/tasks/7/attachments/5">link</a>`, FilterAttachmentImages(source, "https://task.test", func(tid, aid int64) bool { return tid == 7 && aid == 5 }))
	}
	for _, source := range []string{
		`<img src="https://other.test/api/v2/tasks/7/attachments/5">`,
		`<img src="https://evil@task.test/api/v2/tasks/7/attachments/5">`,
		`<img src="/api/v2/tasks/7/attachments/50">`,
		`<img src="/api/v2/tasks/8/attachments/5">`,
		`<img data-src="https://other.test/image" src="/api/v2/tasks/7/attachments/5">`,
		`<p>文字 &amp; 空格</p><!-- keep --><img src="data:image/png;base64,AA==">`,
	} {
		assert.Equal(t, source, FilterAttachmentImages(source, "https://task.test", func(tid, aid int64) bool { return tid == 7 && aid == 5 }))
	}
	assert.Empty(t, FilterAttachmentImages(`<img src="https://task.test/sub/api/v2/tasks/7/attachments/5">`, "https://task.test/sub/", func(_, _ int64) bool { return true }))
}
