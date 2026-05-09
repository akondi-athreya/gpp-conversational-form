import { useEffect, useState } from 'react'
import './App.css'

function FormRenderer({ schema, onChange, formData }) {
  if (!schema || !schema.properties) return <div className="form-placeholder">Describe a form to get started...</div>

  return (
    <div className="form-container">
      <h2>{schema.title || 'Form Preview'}</h2>
      <form>
        {Object.entries(schema.properties).map(([key, def]) => {
          const testid = `field-${key}`
          // handle conditional x-show-when
          const x = def['x-show-when']
          let isVisible = true
          if (x) {
            const targetVal = formData && formData[x.field]
            isVisible = targetVal === x.equals
          }

          const fieldContent = () => {
            if (def.type === 'boolean') {
              return (
                <label className="checkbox-label">
                  <input
                    name={key}
                    type="checkbox"
                    checked={!!(formData && formData[key])}
                    onChange={(e) => onChange(key, e.target.checked)}
                  />
                  {def.title || key}
                </label>
              )
            }

            if (def.type === 'number') {
              return (
                <>
                  <label>{def.title || key}</label>
                  <input
                    name={key}
                    type="number"
                    placeholder={`Enter ${def.title || key}...`}
                    value={formData && formData[key] ? formData[key] : ''}
                    onChange={(e) => onChange(key, e.target.value)}
                  />
                </>
              )
            }

            if (def.enum) {
              return (
                <>
                  <label>{def.title || key}</label>
                  <select
                    name={key}
                    value={formData && formData[key] ? formData[key] : ''}
                    onChange={(e) => onChange(key, e.target.value)}
                  >
                    <option value="">Select {def.title || key}...</option>
                    {def.enum.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </>
              )
            }

            const inputType = def.format === 'email' ? 'email' : 'text'
            return (
              <>
                <label>{def.title || key}</label>
                <input
                  name={key}
                  type={inputType}
                  placeholder={`Enter ${def.title || key}...`}
                  value={formData && formData[key] ? formData[key] : ''}
                  onChange={(e) => onChange(key, e.target.value)}
                />
              </>
            )
          }

          return (
            <div key={key} data-testid={testid} className="field-row" style={{ display: isVisible ? 'block' : 'none' }}>
              {fieldContent()}
            </div>
          )
        })}
      </form>
    </div>
  )
}

function computeDiff(prevSchema, newSchema) {
  const prevKeys = prevSchema && prevSchema.properties ? Object.keys(prevSchema.properties) : []
  const newKeys = newSchema && newSchema.properties ? Object.keys(newSchema.properties) : []
  const added = newKeys.filter((k) => !prevKeys.includes(k))
  const removed = prevKeys.filter((k) => !newKeys.includes(k))
  return { added, removed }
}

function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [schema, setSchema] = useState(null)
  const [prevSchema, setPrevSchema] = useState(null)
  const [formData, setFormData] = useState({})
  const [diff, setDiff] = useState(null)
  const [conversationId, setConversationId] = useState(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (schema && prevSchema) {
      setDiff(computeDiff(prevSchema, schema))
    } else {
      setDiff(null)
    }
  }, [schema, prevSchema])

  const send = async () => {
    if (!input.trim()) return
    const userMsg = { from: 'user', text: input }
    setMessages((m) => [...m, userMsg])
    const body = { prompt: input }
    if (conversationId) body.conversationId = conversationId
    setInput('')

    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

    try {
      const res = await fetch(`${API_BASE_URL}/api/form/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (data.status === 'clarification_needed') {
        setConversationId(data.conversationId)
        setMessages((m) => [...m, { from: 'assistant', text: 'I need clarification: ' + data.questions.join(' | ') }])
        return
      }

      if (res.ok && data.schema) {
        setPrevSchema(schema)
        setSchema(data.schema)
        setVersion(data.version)
        setConversationId(data.conversationId || conversationId)
        setMessages((m) => [...m, { from: 'assistant', text: 'Generated schema (version ' + data.version + ')' }])
        setFormData({})
      } else {
        setMessages((m) => [...m, { from: 'assistant', text: 'Error generating schema: ' + (data.error || 'unknown') }])
      }
    } catch (err) {
      setMessages((m) => [...m, { from: 'assistant', text: 'Request failed: ' + String(err) }])
    }
  }

  const onFieldChange = (key, value) => {
    setFormData((fd) => ({ ...fd, [key]: value }))
  }

  const exportJson = async () => {
    if (!schema) return
    await navigator.clipboard.writeText(JSON.stringify(schema, null, 2))
    alert('Schema JSON copied to clipboard')
  }

  const copyCode = async () => {
    const code = `// Example: use generated schema to render form\nconst schema = ${JSON.stringify(schema, null, 2)}\nconsole.log(schema)`
    await navigator.clipboard.writeText(code)
    alert('Code snippet copied')
  }

  const copyCurl = async () => {
    const curl = `curl -X POST http://localhost:8080/api/form/generate -H "Content-Type: application/json" -d '${JSON.stringify({ prompt: 'Get current schema' })}'`
    await navigator.clipboard.writeText(curl)
    alert('cURL copied')
  }

  return (
    <div className="app-root">
      <div className="split">
        <aside className="pane chat" data-testid="chat-pane">
          <header className="chat-header">
            <h1>Form Assistant</h1>
          </header>
          
          <div className="messages">
            {messages.length === 0 && <div className="empty">How can I help you build your form today?</div>}
            {messages.map((m, i) => (
              <div key={i} className={`message ${m.from}`}>
                {m.text}
              </div>
            ))}
          </div>

          <div className="composer">
            <input
              aria-label="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe the form you want..."
              onKeyPress={(e) => e.key === 'Enter' && send()}
            />
            <button type="button" onClick={send}>Send</button>
          </div>
        </aside>

        <main className="pane form" data-testid="form-renderer-pane">
          <section className="renderer">
            <FormRenderer schema={schema} onChange={onFieldChange} formData={formData} />
          </section>

          <aside className="right-col">
            {version > 1 && (
              <div data-testid="schema-diff-panel" className="diff-panel">
                <h3>Schema Changes</h3>
                {diff && (diff.added.length > 0 || diff.removed.length > 0) ? (
                  <div className="diff-list">
                    {diff.added.map((a) => <div key={a} className="diff-item added">+ {a}</div>)}
                    {diff.removed.map((r) => <div key={r} className="diff-item removed">- {r}</div>)}
                  </div>
                ) : (
                  <div className="empty-diff">No structural changes</div>
                )}
              </div>
            )}

            <div data-testid="export-panel" className="export-panel">
              <h3>Export & Code</h3>
              <button data-testid="export-json-button" onClick={exportJson}>
                Export JSON Schema
              </button>
              <button data-testid="copy-code-button" onClick={copyCode}>
                <span>{`</>`}</span> Copy React Snippet
              </button>
              <button data-testid="copy-curl-button" onClick={copyCurl}>
                <span>{`>_`}</span> Copy cURL Command
              </button>
            </div>
          </aside>
        </main>
      </div>
    </div>
  )
}

export default App
