import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

interface Recall {
  reason: string;
  recalledAt: string;
}

interface Batch {
  id: number;
  medicineName: string;
  manufacturer: string;
  lotNumber: string;
  expiresOn: string;
  recall: Recall | null;
  balances: Array<{ locationCode: string; locationName: string; quantity: number }>;
  receipts: Array<{ id: number; locationCode: string; quantity: number; receivedAt: string }>;
  transfers: Array<{
    id: number;
    fromLocationCode: string;
    toLocationCode: string;
    quantity: number;
    transferredAt: string;
  }>;
}

interface Publication {
  bucket: string;
  key: string;
  queue: string;
  messageId: string;
}

const counts = new Intl.NumberFormat();
const dates = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const initialBatchId = new URLSearchParams(window.location.search).get('batch') ?? '1';

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(data?.message ?? 'MedTrace could not complete the request.');
  }
  return data as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

function App() {
  const [batchId, setBatchId] = useState(initialBatchId);
  const [lookup, setLookup] = useState({ id: initialBatchId });
  const [batch, setBatch] = useState<Batch | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'recall' | 'publish' | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [publication, setPublication] = useState<Publication | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadBatch() {
      try {
        const result = await requestJson<Batch>(`/api/batches/${encodeURIComponent(lookup.id)}`, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setBatch(result);
      } catch (error) {
        if (!controller.signal.aborted) setError(errorMessage(error));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadBatch();
    return () => controller.abort();
  }, [lookup]);

  function findBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPublication(null);
    setReason('');
    setBatch(null);
    setLoading(true);
    setLookup({ id: batchId.trim() });
  }

  async function recallBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!batch || !reason.trim()) return;
    setAction('recall');
    setError('');
    try {
      await requestJson('/api/batch-recalls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: batch.id, reason }),
      });
      setReason('');
      setBatch(null);
      setLoading(true);
      setLookup({ id: String(batch.id) });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setAction(null);
    }
  }

  async function publish() {
    if (!batch?.recall) return;
    setAction('publish');
    setError('');
    try {
      setPublication(await requestJson<Publication>(`/api/batch-recalls/${batch.id}/publish`, { method: 'POST' }));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setAction(null);
    }
  }

  const total = batch?.balances.reduce((sum, balance) => sum + balance.quantity, 0) ?? 0;

  return (
    <>
      <header className="masthead">
        <div className="masthead-inner">
          <div className="brand"><span className="brand-mark" aria-hidden="true">+</span>MedTrace</div>
          <span className="environment">Local demo</span>
        </div>
      </header>
      <main>
        <section className="page-intro" aria-labelledby="page-title">
          <h1 id="page-title">Batch traceability</h1>
          <p>Find a batch, trace its stock, and publish a recall through AWS Emulator.</p>
        </section>

        <form className="lookup card" onSubmit={findBatch}>
          <div className="lookup-field">
            <label htmlFor="batch-id">Batch ID</label>
            <input id="batch-id" type="number" min="1" max="2147483647" step="1" required
              value={batchId} onChange={(event) => setBatchId(event.target.value)} />
          </div>
          <button type="submit" disabled={loading || action !== null}>Look up batch</button>
        </form>

        {loading && <p role="status" className="feedback">Loading batch…</p>}
        {error && <p role="alert" className="feedback error">{error}</p>}

        {batch && (
          <>
            <section className="batch-heading" aria-labelledby="batch-name">
              <div>
                <h2 id="batch-name">{batch.medicineName}</h2>
                <p>{batch.manufacturer} · Lot {batch.lotNumber} · Expires {batch.expiresOn}</p>
              </div>
              <span className={batch.recall ? 'status recalled' : 'status active'}>
                {batch.recall ? 'Recalled' : 'Active'}
              </span>
            </section>

            <div className="dashboard">
              <div className="details">
                <section className="card padded" aria-labelledby="stock-title">
                  <div className="section-heading">
                    <h3 id="stock-title">{batch.recall ? 'Affected stock' : 'Stock by location'}</h3>
                    <span className="amount">{counts.format(total)} units</span>
                  </div>
                  {batch.balances.length ? (
                    <table>
                      <thead><tr><th scope="col">Location</th><th scope="col">Units</th></tr></thead>
                      <tbody>{batch.balances.map((balance) => (
                        <tr key={balance.locationCode}>
                          <td>{balance.locationName}<small>{balance.locationCode}</small></td>
                          <td>{counts.format(balance.quantity)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  ) : <p className="empty">No stock recorded.</p>}
                </section>

                <section className="card padded history" aria-labelledby="history-title">
                  <h3 id="history-title">Movement history</h3>
                  <History title="Transfers" entries={batch.transfers.map((item) => ({
                    id: item.id,
                    label: `${item.fromLocationCode} → ${item.toLocationCode}`,
                    quantity: item.quantity,
                    date: item.transferredAt,
                  }))} />
                  <History title="Receipts" entries={batch.receipts.map((item) => ({
                    id: item.id, label: item.locationCode, quantity: item.quantity, date: item.receivedAt,
                  }))} />
                </section>
              </div>

              <section className="card padded recall-panel" aria-labelledby="recall-title">
                <h3 id="recall-title">Recall</h3>
                {batch.recall ? (
                  <>
                    <p className="reason">{batch.recall.reason}</p>
                    <p className="empty">{dates.format(new Date(batch.recall.recalledAt))}</p>
                    <div className="publication">
                      <h4>AWS Emulator</h4>
                      <p>Save the recall report to S3 and queue a notification in SQS.</p>
                      <button type="button" onClick={publish} disabled={action !== null || publication !== null}>
                        {action === 'publish' ? 'Publishing…' : publication ? 'Recall published' : 'Publish recall'}
                      </button>
                      {publication && (
                        <div className="publication-result" role="status">
                          <strong>Report saved and notification queued</strong>
                          <dl>
                            <dt>S3 object</dt><dd>{publication.bucket}/{publication.key}</dd>
                            <dt>SQS queue</dt><dd>{publication.queue}</dd>
                            <dt>Message ID</dt><dd>{publication.messageId}</dd>
                          </dl>
                          <a href={`/api/batch-recalls/${batch.id}/report`}>Download JSON report</a>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <form className="recall-form" onSubmit={recallBatch}>
                    <p>Recording a recall blocks further receipts and transfers for this batch.</p>
                    <label htmlFor="recall-reason">Recall reason</label>
                    <textarea id="recall-reason" rows={3} required value={reason}
                      onChange={(event) => setReason(event.target.value)} />
                    <button type="submit" className="danger" disabled={action !== null || !reason.trim()}>
                      {action === 'recall' ? 'Recording…' : 'Record recall'}
                    </button>
                  </form>
                )}
              </section>
            </div>
          </>
        )}
        <EmulatorPanel key={batch?.id ?? 'no-batch'} batchId={batch?.recall ? batch.id : undefined} />
      </main>
    </>
  );
}

function EmulatorPanel({ batchId }: { batchId?: number }) {
  const [working, setWorking] = useState<'queue' | 'report' | null>(null);
  const [error, setError] = useState('');
  const [queue, setQueue] = useState<{
    queue: string;
    messages: Array<{ id?: string; body: string }>;
  } | null>(null);
  const [report, setReport] = useState<unknown>(null);

  async function inspectQueue() {
    setWorking('queue');
    setError('');
    setQueue(null);
    try {
      setQueue(await requestJson('/api/batch-recalls/notifications/inspect', { method: 'POST' }));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setWorking(null);
    }
  }

  async function viewReport() {
    if (batchId === undefined) return;
    setWorking('report');
    setError('');
    setReport(null);
    try {
      setReport(await requestJson(`/api/batch-recalls/${batchId}/report`));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setWorking(null);
    }
  }

  return (
    <section className="card padded emulator-panel" aria-labelledby="emulator-title">
      <h3 id="emulator-title">AWS Emulator</h3>
      <div className="emulator-actions">
        <button type="button" onClick={inspectQueue} disabled={working !== null}>
          {working === 'queue' ? 'Reading queue…' : 'Read SQS messages'}
        </button>
        {batchId !== undefined && (
          <button type="button" onClick={viewReport} disabled={working !== null}>
            {working === 'report' ? 'Reading report…' : `View S3 report for batch ${batchId}`}
          </button>
        )}
      </div>
      {error && <p role="alert" className="feedback error">{error}</p>}
      {queue && (
        <div className="emulator-data">
          <h4>SQS · {queue.queue}</h4>
          <p className="empty" role="status">
            {queue.messages.length === 0
              ? 'No messages returned.'
              : `${queue.messages.length} messages returned. They remain in the queue.`}
          </p>
          {queue.messages.map((message, index) => (
            <div className="emulator-message" key={message.id ?? index}>
              <small>Message ID {message.id ?? 'unavailable'}</small>
              <pre>{formatMessage(message.body)}</pre>
            </div>
          ))}
        </div>
      )}
      {report !== null && (
        <div className="emulator-data">
          <h4>S3 · Recall report for batch {batchId}</h4>
          <pre>{JSON.stringify(report, null, 2)}</pre>
        </div>
      )}
    </section>
  );
}

function formatMessage(body: string) {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function History({ title, entries }: {
  title: string;
  entries: Array<{ id: number; label: string; quantity: number; date: string }>;
}) {
  return (
    <div className="history-group">
      <h4>{title}</h4>
      {entries.length ? (
        <ul>
          {entries.map((entry) => (
            <li key={entry.id}>
              <span>{entry.label}<small>{dates.format(new Date(entry.date))}</small></span>
              <strong>{counts.format(entry.quantity)}</strong>
            </li>
          ))}
        </ul>
      ) : <p className="empty">No {title.toLowerCase()} recorded.</p>}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
