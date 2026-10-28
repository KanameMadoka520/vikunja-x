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

package apiv2

import (
	"context"
	"errors"
	"mime"
	"time"

	"code.vikunja.io/api/pkg/modules/tcyai"
	"code.vikunja.io/api/pkg/modules/tcylocale"
	"github.com/danielgtaylor/huma/v2"
)

func init() { AddRouteRegistrar(RegisterTCYAttachmentRoutes) }

type chatFileInput struct {
	ID   string `path:"id" format:"uuid" doc:"Private conversation owned by this human account."`
	File string `path:"file" minLength:"64" maxLength:"64" doc:"Attachment hash referenced in this conversation."`
}
type chatBinaryResponse struct {
	ContentType        string `header:"Content-Type"`
	ContentDisposition string `header:"Content-Disposition"`
	CacheControl       string `header:"Cache-Control"`
	NoSniff            string `header:"X-Content-Type-Options"`
	Body               []byte
}

func chatFileError(ctx context.Context, err error) error {
	if errors.Is(err, tcyai.ErrAttachmentMissing) {
		return huma.Error404NotFound(tcylocale.Render(ctx, tcylocale.Error("chatAttachmentMissing")))
	}
	if errors.Is(err, tcyai.ErrAttachmentInvalid) || errors.Is(err, tcyai.ErrImageModel) {
		return huma.Error422UnprocessableEntity(tcylocale.Render(ctx, tcylocale.Error(err.Error())))
	}
	return conversationError(ctx, err)
}
func RegisterTCYAttachmentRoutes(api huma.API) {
	op := func(id, method, path, summary string) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Summary: summary, Description: "Private account-owned conversation attachments. Human sessions only; no API-token, link-share or MCP access. Files are encrypted and reused between branches. Downloads never expose a public URL.", Tags: []string{"tcymc-ai"}, MaxBodyBytes: tcyai.MaxChatAttachmentBytes + 1024*1024, BodyReadTimeout: 2 * time.Minute}
	}
	Register(api, op("tcy-ai-attachments-upload", "POST", "/ai/conversations/{id}/attachments", "Upload a private conversation attachment"), func(ctx context.Context, in *struct {
		ID      string `path:"id" format:"uuid"`
		RawBody huma.MultipartFormFiles[struct {
			File huma.FormFile `form:"file" required:"true"`
		}]
	}) (*struct{ Body tcyai.ChatAttachment }, error) {
		uid, err := aiUser(ctx)
		if err != nil {
			return nil, err
		}
		form := in.RawBody.Data()
		if form == nil || form.File.File == nil {
			return nil, huma.Error400BadRequest("Missing file")
		}
		defer form.File.Close()
		value, err := tcyai.UploadChatAttachment(uid, in.ID, form.File.Filename, form.File)
		if err != nil {
			return nil, chatFileError(ctx, err)
		}
		return &struct{ Body tcyai.ChatAttachment }{Body: value}, nil
	})
	Register(api, op("tcy-ai-attachments-download", "GET", "/ai/conversations/{id}/attachments/{file}", "Download a referenced conversation attachment"), func(ctx context.Context, in *chatFileInput) (*chatBinaryResponse, error) {
		uid, err := aiUser(ctx)
		if err != nil {
			return nil, err
		}
		item, data, err := tcyai.DownloadChatAttachment(uid, in.ID, in.File)
		if err != nil {
			return nil, chatFileError(ctx, err)
		}
		return &chatBinaryResponse{ContentType: item.MIME, ContentDisposition: mime.FormatMediaType("attachment", map[string]string{"filename": item.Name}), CacheControl: "no-store", NoSniff: "nosniff", Body: data}, nil
	})
	Register(api, op("tcy-ai-attachments-remove", "DELETE", "/ai/conversations/{id}/attachments/{file}", "Remove an unsent attachment; preserve files referenced by other turns or branches"), func(ctx context.Context, in *chatFileInput) (*emptyBody, error) {
		uid, err := aiUser(ctx)
		if err != nil {
			return nil, err
		}
		if err = tcyai.RemoveChatDraftAttachment(uid, in.ID, in.File); err != nil {
			return nil, chatFileError(ctx, err)
		}
		return &emptyBody{}, nil
	})
	Register(api, op("tcy-ai-conversations-export", "GET", "/ai/conversations/{id}/export", "Export the transcript as JSON, Markdown, or Markdown with attachments in a ZIP"), func(ctx context.Context, in *struct {
		ID     string `path:"id" format:"uuid"`
		Format string `query:"format" enum:"json,md,zip" default:"zip" doc:"ZIP includes relative attachment references and original files. Missing attachments are marked in place."`
	}) (*chatBinaryResponse, error) {
		uid, err := aiUser(ctx)
		if err != nil {
			return nil, err
		}
		data, kind, err := tcyai.ExportConversation(uid, in.ID, in.Format)
		if err != nil {
			return nil, chatFileError(ctx, err)
		}
		return &chatBinaryResponse{ContentType: kind, ContentDisposition: mime.FormatMediaType("attachment", map[string]string{"filename": "conversation-" + in.ID + "." + in.Format}), CacheControl: "no-store", NoSniff: "nosniff", Body: data}, nil
	})
}
