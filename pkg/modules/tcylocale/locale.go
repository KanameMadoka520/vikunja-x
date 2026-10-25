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

package tcylocale

import (
	"context"
	"errors"
	"strings"

	"code.vikunja.io/api/pkg/i18n"
	"code.vikunja.io/api/pkg/modules/humabridge"
)

type LocalizedError struct {
	Key  string
	Args []any
}

func (e *LocalizedError) Error() string { return i18n.T("en", e.Key, e.Args...) }
func Error(key string, args ...any) error {
	return &LocalizedError{Key: "tcymc.errors." + key, Args: args}
}
func Language(ctx context.Context) string {
	ec := humabridge.EchoContextFrom(ctx)
	if ec != nil && strings.HasPrefix(strings.ToLower((*ec).Request().Header.Get("Accept-Language")), "zh") {
		return "zh-CN"
	}
	return "en"
}
func Render(ctx context.Context, err error) string {
	var localized *LocalizedError
	if errors.As(err, &localized) {
		return i18n.T(Language(ctx), localized.Key, localized.Args...)
	}
	return err.Error()
}
func Text(ctx context.Context, key string, args ...any) string {
	return i18n.T(Language(ctx), "tcymc."+key, args...)
}
