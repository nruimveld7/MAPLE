alter table sessions
	add column if not exists used_temp_password boolean not null default false;
