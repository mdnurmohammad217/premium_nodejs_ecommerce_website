/**
 * v3.14 additions to the database: the live chat (website chat box ↔
 * Dashboard → Live Chat). Additive only — two new tables, nothing existing
 * is changed. server.ts creates them on start (see ensureSchema);
 * database/upgrade-v3.12.sql has the same for hosts where the app may not
 * create tables.
 */

export const V314_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [];

export const V314_INDEXES: Array<{ table: string; name: string; ddl: string }> = [];

export const V314_TABLES: Array<{ name: string; ddl: string }> = [
  {
    // One chat with one visitor. `token` is the visitor's secret key (kept in
    // their browser); the dashboard works with the id.
    name: 'live_chat_conversations',
    ddl: `CREATE TABLE IF NOT EXISTS \`live_chat_conversations\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`token\` varchar(64) NOT NULL,
      \`customer_name\` varchar(191) NOT NULL,
      \`customer_phone\` varchar(32) DEFAULT NULL,
      \`customer_id\` int(11) DEFAULT NULL,
      \`status\` varchar(16) NOT NULL DEFAULT 'open',
      \`page_url\` varchar(500) DEFAULT NULL,
      \`page_title\` varchar(255) DEFAULT NULL,
      \`ip_address\` varchar(64) DEFAULT NULL,
      \`user_agent\` varchar(500) DEFAULT NULL,
      \`unread_admin\` int(11) NOT NULL DEFAULT 0,
      \`unread_customer\` int(11) NOT NULL DEFAULT 0,
      \`last_message\` varchar(255) DEFAULT NULL,
      \`last_sender\` varchar(16) DEFAULT NULL,
      \`last_message_at\` timestamp NULL DEFAULT current_timestamp(),
      \`created_at\` timestamp NULL DEFAULT current_timestamp(),
      \`updated_at\` timestamp NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_live_chat_token\` (\`token\`),
      KEY \`idx_live_chat_status\` (\`status\`,\`last_message_at\`),
      KEY \`idx_live_chat_unread\` (\`unread_admin\`),
      KEY \`idx_live_chat_phone\` (\`customer_phone\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    // sender: customer | agent | system
    name: 'live_chat_messages',
    ddl: `CREATE TABLE IF NOT EXISTS \`live_chat_messages\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`conversation_id\` int(11) NOT NULL,
      \`sender\` varchar(16) NOT NULL,
      \`author\` varchar(100) DEFAULT NULL,
      \`body\` text NOT NULL,
      \`created_at\` timestamp NULL DEFAULT current_timestamp(),
      PRIMARY KEY (\`id\`),
      KEY \`idx_live_chat_msg_conv\` (\`conversation_id\`,\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
];
