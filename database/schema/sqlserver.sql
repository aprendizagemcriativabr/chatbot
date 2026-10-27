SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (
  SELECT 1
  FROM sys.tables t
  INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
  WHERE s.name = 'dbo' AND t.name = 'articulator'
)
BEGIN
  CREATE TABLE dbo.articulator (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(13) NOT NULL UNIQUE,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    deleted_at DATETIME2 NULL
  );
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.tables t
  INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
  WHERE s.name = 'dbo' AND t.name = 'conversation'
)
BEGIN
  CREATE TABLE dbo.conversation (
    id INT IDENTITY(1,1) PRIMARY KEY,
    articulator_id INT NOT NULL,
    stage VARCHAR(30) NOT NULL DEFAULT 'idle',
    current_question_order INT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    deleted_at DATETIME2 NULL,
    CONSTRAINT CK_conversation_stage
      CHECK (stage IN ('idle', 'awaiting_media', 'awaiting_questions', 'awaiting_confirmation')),
    CONSTRAINT FK_conversation_articulator
      FOREIGN KEY (articulator_id) REFERENCES dbo.articulator(id)
  );
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.tables t
  INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
  WHERE s.name = 'dbo' AND t.name = 'question'
)
BEGIN
  CREATE TABLE dbo.question (
    id INT IDENTITY(1,1) PRIMARY KEY,
    text NVARCHAR(MAX) NOT NULL,
    type VARCHAR(30) NOT NULL,
    helper_text NVARCHAR(MAX) NULL,
    required BIT NOT NULL DEFAULT 1,
    [order] INT NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT CK_question_type
      CHECK (type IN ('text', 'single_choice', 'multiple_choice'))
  );
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.tables t
  INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
  WHERE s.name = 'dbo' AND t.name = 'question_option'
)
BEGIN
  CREATE TABLE dbo.question_option (
    id INT IDENTITY(1,1) PRIMARY KEY,
    question_id INT NOT NULL,
    title NVARCHAR(MAX) NOT NULL,
    value NVARCHAR(255) NOT NULL,
    [order] INT NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_question_option_question
      FOREIGN KEY (question_id) REFERENCES dbo.question(id) ON DELETE CASCADE,
    CONSTRAINT UQ_question_option_value UNIQUE (question_id, value),
    CONSTRAINT UQ_question_option_order UNIQUE (question_id, [order])
  );
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.tables t
  INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
  WHERE s.name = 'dbo' AND t.name = 'google_oauth_token'
)
BEGIN
  CREATE TABLE dbo.google_oauth_token (
    account_key VARCHAR(50) PRIMARY KEY,
    access_token NVARCHAR(MAX) NULL,
    refresh_token NVARCHAR(MAX) NOT NULL,
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.tables t
  INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
  WHERE s.name = 'dbo' AND t.name = 'conversation_answer'
)
BEGIN
  CREATE TABLE dbo.conversation_answer (
    id INT IDENTITY(1,1) PRIMARY KEY,
    conversation_id INT NOT NULL,
    question_id INT NOT NULL,
    answer_value NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_answer_conversation
      FOREIGN KEY (conversation_id) REFERENCES dbo.conversation(id) ON DELETE CASCADE,
    CONSTRAINT FK_answer_question
      FOREIGN KEY (question_id) REFERENCES dbo.question(id) ON DELETE CASCADE,
    CONSTRAINT UQ_answer_conversation_question UNIQUE (conversation_id, question_id)
  );
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.tables t
  INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
  WHERE s.name = 'dbo' AND t.name = 'app_config'
)
BEGIN
  CREATE TABLE dbo.app_config (
    config_key VARCHAR(50) PRIMARY KEY,
    config_value VARCHAR(255) NOT NULL,
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
END;

COMMIT TRANSACTION;
