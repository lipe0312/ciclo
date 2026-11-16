-- Ciclo · #107 Exercício personalizado por conta: a IA cria quando não acha no catálogo (exceção controlada à regra
-- "IDs só do catálogo"). Só tabela nova. Chave começando por user_id (ADR-0007); até 200 por conta (checado na API,
-- atomicamente). Nome e descrição são dado do usuário; o vídeo é só link do YouTube já normalizado no core.
CREATE TABLE exercicio_personalizado (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  id TEXT NOT NULL CHECK (id GLOB 'cus_*' AND length(id) BETWEEN 12 AND 36),
  nome TEXT NOT NULL CHECK (length(nome) BETWEEN 2 AND 80),
  musculo TEXT NOT NULL CHECK (length(musculo) BETWEEN 1 AND 20),
  aparelho TEXT CHECK (aparelho IS NULL OR length(aparelho) BETWEEN 1 AND 40),
  descricao TEXT NOT NULL CHECK (length(descricao) BETWEEN 1 AND 600),
  video_url TEXT CHECK (video_url IS NULL OR (video_url GLOB 'https://www.youtube.com/watch?v=*' AND length(video_url) <= 60)),
  criado_por TEXT NOT NULL CHECK (criado_por IN ('ia', 'usuario')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
