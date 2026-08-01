import os, glob
f = 'postgres/init/002-schema-tracking.sql'
c = open(f).read()
migrations = [os.path.basename(m)[:-4] for m in glob.glob('database/migrations/*.sql')]
inserts = '\n'.join("INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ('{}', '{}.sql', 'pre-seeded') ON CONFLICT DO NOTHING;".format(m, m) for m in migrations)
c = c + '\n' + inserts + '\n'
open(f,'w').write(c)
