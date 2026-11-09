-- Dados iniciais FICTÍCIOS (perfil de exemplo). Edite pelo app em "Perfil".
INSERT INTO profile (id, data, updated_at) VALUES (1, '{
  "level": 1,
  "goal": { "id": "bracos_ombros", "statement": "Braços e ombros maiores mantendo a cintura", "horizonWeeks": 12,
            "metrics": { "bracoCm": 1.5, "cinturaCm": 0, "pesoKg": 1.5, "aderenciaPct": 80 } },
  "priorities": ["ombro", "biceps", "triceps"],
  "minutes": 60, "daysTarget": 4, "weekStart": "seg", "flexWeek": true,
  "prefs": {}, "pinned": {}, "avoid": [], "remembered": [],
  "autonomy": "carga_sozinho", "diet": { "mode": "leve", "kcal": 2650, "protein": 139 },
  "tiers": { "Hoje": "haiku", "Treino": "sonnet", "Corpo": "opus", "Comida": "haiku", "Plano": "opus" },
  "dayGym": { "seg": "acad1", "ter": "acad1", "qua": "acad2", "qui": "acad1", "sex": "acad2", "sab": "casa", "dom": "casa" }
}', 0);

INSERT INTO gym (id, name, equipment, busy_hours, sort, created_at) VALUES
 ('acad1', 'Academia 1', '["halteres","barra","ez","banco","rack","elastico","polia","puxador","remada","legpress","smith","extensora","flexora","flexora_sent","peck","supmaq","desenv","remmaq","pant","barrafixa","paralela"]', '["18-20"]', 0, 0),
 ('acad2', 'Academia 2', '["halteres","banco","polia","puxador","legpress","extensora","flexora","barrafixa"]', '[]', 1, 0),
 ('casa', 'Casa', '["halteres","elastico","barrafixa"]', '[]', 2, 0);
