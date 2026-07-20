/**
 * BANCO DI PROVA VISIVO — non fa parte dell'app.
 *
 * Vite builda solo index.html, quindi questo esiste solo in `npm run dev:vite`
 * (http://127.0.0.1:5173/ui-check.html).
 *
 * Perche' esiste: il renderer non ha test, e meta' delle superfici del Cockpit
 * (prompt permessi, pannelli, schede strumento, diff) si vedono solo quando
 * l'app e' connessa e capita la situazione giusta. Si puo' lavorare per giorni
 * senza incontrarle, e accorgersi di un difetto settimane dopo, dal telefono.
 * Qui vengono montate TUTTE insieme, con dati finti e senza engine — quindi
 * senza lasciare in giro processi claude orfani.
 *
 * Monta i componenti VERI, non markup ricopiato: se il markup cambia, il banco
 * di prova cambia con lui invece di mentire.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';

import { PermissionPrompt } from './components/PermissionPrompt';
import { ChatView } from './components/ChatView';
import { TodoPanel } from './components/TodoPanel';
import { QuickActions } from './components/QuickActions';
import { Tabs } from './components/Tabs';
import { Icon } from './components/icons';
import type { Item } from './model';

const noop = () => {};

const items: Item[] = [
  { kind: 'user', id: 'u1', text: 'Riscrivi il foglio di stile a strati e dimmi cosa si rompe.' },
  {
    kind: 'thinking',
    id: 't0',
    text: 'Il file e\' organizzato per versione, non per componente. Quarantacinque selettori sono dichiarati piu\' volte.',
  },
  {
    kind: 'assistant',
    id: 'a1',
    text:
      'Ho letto `theme.css`. Il file e\' organizzato a **strati cronologici** e dodici selettori sono definiti piu\' volte: vince l\'ultimo, in silenzio.\n\n' +
      '- `.chat .md pre` compare quattro volte, con fondi diversi\n' +
      '- `.composer` e\' un ibrido di due design\n\n' +
      'Ecco cosa propongo:\n\n```css\n@layer vendor, reset, tokens, base, layout, components;\n```\n\n' +
      'Con gli strati dichiarati, l\'ordine di scrittura smette di contare.',
  },
  {
    kind: 'tool',
    id: 'x1',
    name: 'Edit',
    input: { file_path: '/home/raffa/claude-cockpit/app/src/styles/tokens.css' },
    status: 'done',
    result: '--text-3 passa da 3.13:1 a 5.1:1 su --surface-base',
  },
  {
    kind: 'tool',
    id: 'x2',
    name: 'Bash',
    input: { command: 'npm run css:audit' },
    status: 'running',
  },
  {
    kind: 'tool',
    id: 'x3',
    name: 'Read',
    input: { file_path: '/etc/shadow' },
    status: 'error',
    result: 'EACCES: permission denied',
  },
];

const Sezione = ({ titolo, nota, children }: { titolo: string; nota?: string; children: React.ReactNode }) => (
  <section style={{ marginBottom: 'var(--sp-9)' }}>
    <h2
      style={{
        font: 'var(--fs-xs)/1 var(--font-sans)',
        fontWeight: 600,
        letterSpacing: 'var(--tr-label)',
        textTransform: 'uppercase',
        color: 'var(--text-3)',
        borderBottom: '1px solid var(--line)',
        padding: '0 0 var(--sp-3)',
        margin: '0 0 var(--sp-5)',
      }}
    >
      {titolo}
      {nota && <span style={{ color: 'var(--text-faint)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> — {nota}</span>}
    </h2>
    {children}
  </section>
);

function UiCheck() {
  return (
    <div style={{ padding: 'var(--sp-6)', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ font: 'var(--fs-xl)/1.2 var(--font-sans)', fontWeight: 600, color: 'var(--text-1)' }}>
        Cockpit — banco di prova visivo
      </h1>
      <p style={{ font: 'var(--fs-md)/var(--lh-ui) var(--font-sans)', color: 'var(--text-2)', marginBottom: 'var(--sp-9)' }}>
        Superfici che nell'app si vedono solo a caso. Ridimensiona la finestra sotto i 768px per il layout telefono.
      </p>

      <Sezione titolo="Stati semantici" nota="ogni colore deve avere una ragione">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-5)' }}>
          {[
            ['--ok', 'sano / passato'],
            ['--warn', 'attenzione, non fallimento'],
            ['--err', 'fallito / distruttivo'],
            ['--info', 'avviso neutro'],
            ['--busy', 'in volo'],
            ['--accent', 'SOLO azione primaria'],
          ].map(([tok, senso]) => (
            <div key={tok} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
              <span style={{ width: 'var(--sp-4)', height: 'var(--sp-4)', borderRadius: 'var(--r-full)', background: `var(${tok})` }} />
              <span style={{ font: 'var(--fs-data)/1 var(--font-mono)', color: 'var(--text-2)' }}>{tok}</span>
              <span style={{ font: 'var(--fs-sm)/1 var(--font-sans)', color: 'var(--text-3)' }}>{senso}</span>
            </div>
          ))}
        </div>
      </Sezione>

      <Sezione titolo="Bottoni" nota="il corallo compare una volta sola">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-4)', alignItems: 'center' }}>
          <button className="mini primary">Azione primaria</button>
          <button className="mini ghost">Secondaria</button>
          <button className="mini on">Attiva</button>
          <button className="mini ghost btn-icon"><Icon name="close" /></button>
          <button className="mini ghost"><kbd className="kbd-chip">⌘K</kbd></button>
          <span className="dot authed" title="connesso" />
          <span className="dot connecting" />
          <span className="dot disconnected" />
        </div>
      </Sezione>

      <Sezione titolo="Schede" nota="bersagli: ridimensiona o usa un dispositivo touch">
        <div className="tabs-row">
          <Tabs
            tabs={['main', 'b', 'c']}
            active="main"
            busy={{ b: true }}
            titles={{ main: 'Riscrittura CSS', b: 'Audit', c: 'Font' }}
            pins={{ c: true }}
            onRename={noop}
            onTogglePin={noop}
            onSelect={noop}
            onAdd={noop}
            onClose={noop}
          />
          <div className="view-toggle">
            <button className="on">CLI</button>
            <button>Win</button>
            <button>Chat</button>
          </div>
        </div>
      </Sezione>

      <Sezione titolo="Banner d'errore">
        <div className="banner error">
          Engine non raggiungibile sulla 8130.
          <button className="mini primary">Nuova sessione</button>
          <button className="mini ghost">Doctor</button>
          <button className="mini ghost btn-icon"><Icon name="close" /></button>
        </div>
      </Sezione>

      <Sezione titolo="Statusline" nota="tutta in mono: e' la vetrina dei dati">
        <div className="statusline">
          <span><Icon name="folder" size={12} /> claude-cockpit</span>
          <span><Icon name="branch" size={12} /> redesign-strumentazione</span>
          <span>opus-4.8</span>
          <span>effort high</span>
          <span>Bypass</span>
          <span className="sl-hot">ctx 84% (168k/200k)</span>
          <span>$1.24</span>
          <span>#a91f3c7d</span>
        </div>
      </Sezione>

      <Sezione titolo="Azioni rapide">
        <QuickActions actions={[{ label: 'Audit CSS', text: '' }, { label: 'Build', text: '' }, { label: 'Schermate', text: '' }] as never} disabled={false} onRun={noop} />
      </Sezione>

      <Sezione titolo="Chat" nota="prosa serif, schede strumento, diff, blocco pensiero">
        <div style={{ height: 620, position: 'relative', overflow: 'hidden', border: '1px solid var(--line)', borderRadius: 'var(--r-2)' }}>
          <ChatView items={items} thinkingSince={Date.now() - 4000} onOpenFile={noop} />
        </div>
      </Sezione>

      <Sezione titolo="Pannello attivita'">
        <TodoPanel
          todos={[
            { content: 'Riscrivere il foglio a strati', status: 'completed' },
            { content: 'Unificare i quattro neri', status: 'in_progress', activeForm: 'Unifico i quattro neri' },
            { content: 'Layout telefono', status: 'pending' },
          ]}
        />
      </Sezione>

      {/* Il prompt e' un overlay a posizione fissa: mostrato sempre coprirebbe il
          resto del foglio. Si apre con #perm nell'indirizzo. */}
      <Sezione titolo="Prompt permessi" nota="apri con #perm — e' un overlay e copre tutto">
        {location.hash === '#perm' && (
          <PermissionPrompt
            req={{
              requestId: 'r1',
              project: '/home/raffa/claude-cockpit',
              toolName: 'Bash',
              input: { command: 'rm -rf app/src/theme.css', description: 'Rimuove il vecchio foglio di stile' },
            }}
            onDecide={noop}
          />
        )}
      </Sezione>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UiCheck />
  </StrictMode>,
);
