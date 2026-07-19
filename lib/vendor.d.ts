// better-sqlite3 não publica tipos e não queremos uma devDependency @types só para isto.
// O uso é dinâmico (prepare/run/get/all sobre SQL cru); `any` é a anotação honesta aqui.
declare module 'better-sqlite3';
