# Arona UI / 阿罗娜界面

This folder groups the assistant's message, review, preferences, diagnostics, attachment and export UI. The route-level composition lives in `views/TcyAssistant.vue`; all authenticated API access stays in `client/queries`, backed by the generated v2 client.

- `ConversationHistory.vue` / `ConversationMenu.vue`: searchable, pinned and archived history with one shared action menu; see [history management](../../../../docs/conversation-history.md).
- `attachments/ChatAttachmentCard.vue`: private preview, download and draft removal; revokes object URLs on unmount.
- `export/ConversationExport.vue`: format selection, progress, cancellation and download.
- `export/pdf.ts`: local, selectable-text PDF; only authenticated attachment images are embedded.
- `export/files.ts`: file-size formatting and Blob download lifecycle.

See [the module integration guide](../../../../docs/arona-integration.md) for backend entry points, host adapters, storage accounting and migration boundaries. This is an application module, not yet an independent SDK.
