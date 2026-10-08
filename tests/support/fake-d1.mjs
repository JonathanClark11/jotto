// Minimal in-memory stand-in for the D1 queries issued by the daily-stats and player-stats routes.
export function createFakeDb({ daily = [], player = [] } = {}) {
  const state = { daily: daily.map((r) => ({ ...r })), player: player.map((r) => ({ ...r })), inserts: 0 };

  function execute(sql, args) {
    const q = sql.replace(/\s+/g, ' ');
    if (q.startsWith('PRAGMA table_info')) {
      return { results: ['player1_name', 'player2_name', 'player1_key', 'player2_key', 'rematch_code'].map((name) => ({ name })) };
    }
    if (q.includes('FROM cinq_daily_results WHERE date = ? GROUP BY guesses')) {
      const counts = new Map();
      for (const r of state.daily.filter((r) => r.date === args[0])) counts.set(r.guesses, (counts.get(r.guesses) ?? 0) + 1);
      return { results: [...counts].sort((a, b) => a[0] - b[0]).map(([guesses, players]) => ({ guesses, players })) };
    }
    if (q.startsWith('INSERT OR IGNORE INTO cinq_daily_results')) {
      state.inserts += 1;
      const [date, player_key, guesses, completed_at] = args;
      if (state.daily.some((r) => r.date === date && r.player_key === player_key)) return { meta: { changes: 0 } };
      state.daily.push({ date, player_key, guesses, completed_at });
      return { meta: { changes: 1 } };
    }
    if (q.includes('FROM cinq_player_results WHERE player_key = ?')) {
      return { results: state.player.filter((r) => r.player_key === args[0]).sort((a, b) => b.completed_at.localeCompare(a.completed_at)) };
    }
    if (q.includes('FROM cinq_player_results WHERE guesses > 0')) {
      return { results: state.player.filter((r) => r.guesses > 0).map((r) => ({ guesses: r.guesses })) };
    }
    throw new Error(`fake D1: unhandled SQL: ${q}`);
  }

  function prepare(sql) {
    const make = (args) => ({
      bind: (...next) => make(next),
      all: async () => execute(sql, args),
      run: async () => execute(sql, args),
      first: async () => (execute(sql, args).results ?? [])[0] ?? null,
    });
    return make([]);
  }

  return { state, prepare, batch: async (stmts) => stmts.map(() => ({})) };
}
