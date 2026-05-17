alter table users
	add column if not exists temp_password_hash text,
	add column if not exists temp_password_created_at timestamptz;
