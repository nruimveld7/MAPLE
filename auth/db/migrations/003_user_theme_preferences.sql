alter table users
	add column if not exists theme_mode text not null default 'system'
		check (theme_mode in ('light', 'dark', 'system')),
	add column if not exists primary_color text not null default '#58a6ff'
		check (primary_color ~* '^#[0-9a-f]{6}$'),
	add column if not exists secondary_color text not null default '#a855f7'
		check (secondary_color ~* '^#[0-9a-f]{6}$');
