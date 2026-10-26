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

package config

import (
	"sync/atomic"

	"github.com/spf13/viper"
)

// MailerRuntime is an immutable snapshot. Publishing it never mutates Viper while requests run.
type MailerRuntime struct {
	Enabled       bool
	Host          string
	Port          int
	Username      string
	Password      string
	FromEmail     string
	AuthType      string
	TLSMode       string
	SkipTLSVerify bool
	Revision      int64
}

var mailerRuntime atomic.Pointer[MailerRuntime]

func SetMailerRuntime(value *MailerRuntime) {
	if value == nil {
		mailerRuntime.Store(nil)
		return
	}
	copyValue := *value
	mailerRuntime.Store(&copyValue)
}
func CurrentMailerRuntime() MailerRuntime {
	if current := mailerRuntime.Load(); current != nil {
		return *current
	}
	mode := "auto"
	if viper.GetBool(string(MailerForceSSL)) {
		mode = "tls"
	}
	return MailerRuntime{Enabled: viper.GetBool(string(MailerEnabled)), Host: viper.GetString(string(MailerHost)), Port: viper.GetInt(string(MailerPort)), Username: viper.GetString(string(MailerUsername)), Password: viper.GetString(string(MailerPassword)), FromEmail: viper.GetString(string(MailerFromEmail)), AuthType: viper.GetString(string(MailerAuthType)), TLSMode: mode, SkipTLSVerify: viper.GetBool(string(MailerSkipTLSVerify))}
}
