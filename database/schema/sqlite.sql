PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS articulator (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT NULL
);

CREATE TABLE IF NOT EXISTS conversation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  articulator_id INTEGER NOT NULL,
  stage TEXT NOT NULL DEFAULT 'idle' CHECK(stage IN ('idle','awaiting_media','awaiting_questions','awaiting_confirmation')),
  current_question_order INTEGER NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT NULL,
  FOREIGN KEY (articulator_id) REFERENCES articulator(id)
);

CREATE TABLE IF NOT EXISTS question (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('text','single_choice','multiple_choice')),
  helper_text TEXT NULL,
  required INTEGER NOT NULL DEFAULT 1 CHECK(required IN (0,1)),
  "order" INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS question_option (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  value TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (question_id) REFERENCES question(id) ON DELETE CASCADE,
  UNIQUE(question_id, value),
  UNIQUE(question_id, "order")
);

CREATE TABLE IF NOT EXISTS google_oauth_token (
  account_key TEXT PRIMARY KEY,
  access_token TEXT NULL,
  refresh_token TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversation_answer (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  answer_value TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversation(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES question(id) ON DELETE CASCADE,
  UNIQUE(conversation_id, question_id)
);

CREATE TABLE IF NOT EXISTS app_config (
  config_key TEXT PRIMARY KEY,
  config_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
