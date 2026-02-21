import { useState } from 'react';
import './App.css'

function App() {

  // ==============================================================================
  // WIZARD CONFIGURATION
  // ==============================================================================
  // This is the heart of the wizard - it defines every possible step and question.
  // Think of it as a blueprint that tells the wizard what to show and when.
  //
  // How it works:
  // - Each step is an object with questions inside it
  // - Some steps have a 'showIf' function - these only appear if the condition is met
  //   (like showing database config only if the user selected that product)
  // - Questions can also have their own 'showIf' to conditionally appear within a step
  //   (like showing Elasticsearch fields only after selecting Elasticsearch)
  //
  // Question types we support:
  // - 'checkbox': multiple selections (product list)
  // - 'radio': single selection (database choice)
  // - 'text': regular text input (username, host)
  // - 'password': hidden text input (passwords)
  // - 'env_vars': special component for managing environment variables

  const wizardSteps = [
    {
      stepNumber: 1,
      title: "Product Selection",
      questions: [
        {
          id: 'products',
          label: 'Select the products you need:',
          type: 'checkbox',
          options: [
            'Orchestration Cluster',
            'Connectors',
            'Optimize',
            'Management Identity',
            'Web Modeler',
            'Console'
          ],
          required: true
        }
      ]
    },
    {
  stepNumber: 2,
  title: "Orchestration Cluster Database Configuration",
  showIf: (answers) => answers.products?.includes('Orchestration Cluster') && !answers.products?.includes('Optimize'),
  questions: [
    {
      id: 'orchestration_cluster_database',
      label: 'Select database for Orchestration Cluster',
      type: 'radio',
      options: ['Elasticsearch', 'OpenSearch'],
      required: true
    },
    {
      id: 'orchestration_cluster_es_username',
      label: 'Elasticsearch Username',
      type: 'text',
      placeholder: 'elastic',
      required: true,
      showIf: (answers) => answers.orchestration_cluster_database === 'Elasticsearch'
    },
    {
      id: 'orchestration_cluster_es_protocol',
      label: 'Protocol',
      type: 'text',
      placeholder: 'http',
      required: true,
      showIf: (answers) => answers.orchestration_cluster_database === 'Elasticsearch'
    },
    {
      id: 'orchestration_cluster_es_password',
      label: 'Password',
      type: 'password',
      placeholder: 'your-password',
      required: true,
      showIf: (answers) => answers.orchestration_cluster_database === 'Elasticsearch'
    },
    {
      id: 'orchestration_cluster_es_host',
      label: 'Host',
      type: 'text',
      placeholder: 'elasticsearch.example.com',
      required: true,
      showIf: (answers) => answers.orchestration_cluster_database === 'Elasticsearch'
    },
    {
      id: 'orchestration_cluster_os_username',
      label: 'OpenSearch Username',
      type: 'text',
      placeholder: 'elastic',
      required: true,
      showIf: (answers) => answers.orchestration_cluster_database === 'OpenSearch'
    },
    {
      id: 'orchestration_cluster_os_protocol',
      label: 'Protocol',
      type: 'text',
      placeholder: 'https',
      required: true,
      showIf: (answers) => answers.orchestration_cluster_database === 'OpenSearch'
    },
    {
      id: 'orchestration_cluster_os_password',
      label: 'Password',
      type: 'password',
      placeholder: 'your-os-password',
      required: true,
      showIf: (answers) => answers.orchestration_cluster_database === 'OpenSearch'
    },
    {
      id: 'orchestration_cluster_os_host',
      label: 'Host',
      type: 'text',
      placeholder: 'your-os-cluster.example.com',
      required: true,
      showIf: (answers) => answers.orchestration_cluster_database === 'OpenSearch'
    }
  ]
},
{
  stepNumber: 3,
  title: "Optimize Database Configuration",
  showIf: (answers) => answers.products?.includes('Optimize') && !answers.products?.includes('Orchestration Cluster'),
  questions: [
    {
      id: 'optimize_database',
      label: 'Select database for Optimize',
      type: 'radio',
      options: ['Elasticsearch', 'OpenSearch'],
      required: true
    },
    {
      id: 'optimize_es_username',
      label: 'Elasticsearch Username',
      type: 'text',
      placeholder: 'elastic',
      required: true,
      showIf: (answers) => answers.optimize_database === 'Elasticsearch'
    },
    {
      id: 'optimize_es_protocol',
      label: 'Protocol',
      type: 'text',
      placeholder: 'http',
      required: true,
      showIf: (answers) => answers.optimize_database === 'Elasticsearch'
    },
    {
      id: 'optimize_es_password',
      label: 'Password',
      type: 'password',
      placeholder: 'your-password',
      required: true,
      showIf: (answers) => answers.optimize_database === 'Elasticsearch'
    },
    {
      id: 'optimize_es_host',
      label: 'Host',
      type: 'text',
      placeholder: 'elasticsearch.example.com',
      required: true,
      showIf: (answers) => answers.optimize_database === 'Elasticsearch'
    },
    {
      id: 'optimize_os_username',
      label: 'OpenSearch Username',
      type: 'text',
      placeholder: 'elastic',
      required: true,
      showIf: (answers) => answers.optimize_database === 'OpenSearch'
    },
    {
      id: 'optimize_os_protocol',
      label: 'Protocol',
      type: 'text',
      placeholder: 'https',
      required: true,
      showIf: (answers) => answers.optimize_database === 'OpenSearch'
    },
    {
      id: 'optimize_os_password',
      label: 'Password',
      type: 'password',
      placeholder: 'your-os-password',
      required: true,
      showIf: (answers) => answers.optimize_database === 'OpenSearch'
    },
    {
      id: 'optimize_os_host',
      label: 'Host',
      type: 'text',
      placeholder: 'your-os-cluster.example.com',
      required: true,
      showIf: (answers) => answers.optimize_database === 'OpenSearch'
    }
  ]
},
{
  stepNumber: 3.5,
  title: "Shared Search Database Configuration",
  showIf: (answers) => answers.products?.includes('Orchestration Cluster') && answers.products?.includes('Optimize'),
  questions: [
    {
      id: 'shared_database',
      label: 'Select shared database for Orchestration Cluster and Optimize',
      type: 'radio',
      options: ['Elasticsearch', 'OpenSearch'],
      required: true
    },
    {
      id: 'shared_es_username',
      label: 'Elasticsearch Username',
      type: 'text',
      placeholder: 'elastic',
      required: true,
      showIf: (answers) => answers.shared_database === 'Elasticsearch'
    },
    {
      id: 'shared_es_protocol',
      label: 'Protocol',
      type: 'text',
      placeholder: 'http',
      required: true,
      showIf: (answers) => answers.shared_database === 'Elasticsearch'
    },
    {
      id: 'shared_es_password',
      label: 'Password',
      type: 'password',
      placeholder: 'your-password',
      required: true,
      showIf: (answers) => answers.shared_database === 'Elasticsearch'
    },
    {
      id: 'shared_es_host',
      label: 'Host',
      type: 'text',
      placeholder: 'elasticsearch.example.com',
      required: true,
      showIf: (answers) => answers.shared_database === 'Elasticsearch'
    },
    {
      id: 'shared_os_username',
      label: 'OpenSearch Username',
      type: 'text',
      placeholder: 'elastic',
      required: true,
      showIf: (answers) => answers.shared_database === 'OpenSearch'
    },
    {
      id: 'shared_os_protocol',
      label: 'Protocol',
      type: 'text',
      placeholder: 'https',
      required: true,
      showIf: (answers) => answers.shared_database === 'OpenSearch'
    },
    {
      id: 'shared_os_password',
      label: 'Password',
      type: 'password',
      placeholder: 'your-os-password',
      required: true,
      showIf: (answers) => answers.shared_database === 'OpenSearch'
    },
    {
      id: 'shared_os_host',
      label: 'Host',
      type: 'text',
      placeholder: 'your-os-cluster.example.com',
      required: true,
      showIf: (answers) => answers.shared_database === 'OpenSearch'
    }
  ]
},
    {
      stepNumber: 4,
      title: "Management Identity Database Configuration",
      showIf: (answers) => answers.products?.includes('Management Identity'),
      questions: [
        {
          id: 'management_identity_database',
          label: 'Select database for Management Identity',
          type: 'radio',
          options: ['PostgreSQL'],
          required: true
        }
      ]
    },
    {
      stepNumber: 5,
      title: "Web Modeler Database Configuration",
      showIf: (answers) => answers.products?.includes('Web Modeler'),
      questions: [
        {
          id: 'webmodeler_database',
          label: 'Select database for Web Modeler (only for REST API)',
          type: 'radio',
          options: ['PostgreSQL'],
          required: true
        },
        
        // PostgreSQL connection details - shown after selecting PostgreSQL
        {
          id: 'webmodeler_db_url',
          label: 'Database URL',
          type: 'text',
          placeholder: 'your-postgres-host.example.com',
          required: true,
          showIf: (answers) => answers.webmodeler_database === 'PostgreSQL'
        },
        {
          id: 'webmodeler_db_host',
          label: 'Host',
          type: 'text',
          placeholder: 'your-postgres-host.example.com',
          required: true,
          showIf: (answers) => answers.webmodeler_database === 'PostgreSQL'
        },
        {
          id: 'webmodeler_db_user',
          label: 'User',
          type: 'text',
          placeholder: 'webmodeler-user',
          required: true,
          showIf: (answers) => answers.webmodeler_database === 'PostgreSQL'
        },
        {
          id: 'webmodeler_db_password',
          label: 'Password',
          type: 'password',
          placeholder: 'mypassword',
          required: true,
          showIf: (answers) => answers.webmodeler_database === 'PostgreSQL'
        }
      ]
    },

    // ==============================================================================
    // ENVIRONMENT VARIABLES SECTION
    // ==============================================================================
    // Each product gets its own step for  environment variables.
    // Users can add as many name/value pairs as they need, or skip entirely.
    // Web Modeler is special - it has three sub-services (restApi, webApp, websocket)
    // so we ask for env vars separately for each.

    {
      stepNumber: 6,
      title: "Orchestration Cluster Environment Variables",
      showIf: (answers) => answers.products?.includes('Orchestration Cluster'),
      questions: [
        {
          id: 'orchestration_cluster_env_vars',
          label: 'Add environment variables for Orchestration Cluster',
          type: 'env_vars'
        }
      ]
    },
    {
      stepNumber: 7,
      title: "Connectors Environment Variables",
      showIf: (answers) => answers.products?.includes('Connectors'),
      questions: [
        {
          id: 'connectors_env_vars',
          label: 'Add environment variables for Connectors',
          type: 'env_vars'
        }
      ]
    },
    {
      stepNumber: 8,
      title: "Optimize Environment Variables",
      showIf: (answers) => answers.products?.includes('Optimize'),
      questions: [
        {
          id: 'optimize_env_vars',
          label: 'Add environment variables for Optimize',
          type: 'env_vars'
        }
      ]
    },
    {
      stepNumber: 9,
      title: "Management Identity Environment Variables",
      showIf: (answers) => answers.products?.includes('Management Identity'),
      questions: [
        {
          id: 'management_identity_env_vars',
          label: 'Add environment variables for Management Identity',
          type: 'env_vars'
        }
      ]
    },
    {
      stepNumber: 10,
      title: "Web Modeler Environment Variables",
      showIf: (answers) => answers.products?.includes('Web Modeler'),
      // Web Modeler consists of three separate services, each can have its own env vars
      questions: [
        {
          id: 'webmodeler_restapi_env_vars',
          label: 'REST API Environment Variables',
          type: 'env_vars'
        },
        {
          id: 'webmodeler_webapp_env_vars',
          label: 'Web App Environment Variables',
          type: 'env_vars'
        },
        {
          id: 'webmodeler_websocket_env_vars',
          label: 'WebSocket Environment Variables',
          type: 'env_vars'
        }
      ]
    },
    {
      stepNumber: 11,
      title: "Console Environment Variables",
      showIf: (answers) => answers.products?.includes('Console'),
      questions: [
        {
          id: 'console_env_vars',
          label: 'Add environment variables for Console',
          type: 'env_vars'
        }
      ]
    }
  ]


  // ==============================================================================
  // COMPONENT STATE
  // ==============================================================================
  // We use React's useState hook to track three things:
  // 1. Which page we're on (starts at 1)
  // 2. All the answers the user has given so far (starts empty)
  // 3. The generated YAML output (starts empty until they click Generate)

  const [page, setPage] = useState(1)
  const [answers, setAnswers] = useState({})
  const [yamlOutput, setYamlOutput] = useState('')


  // ==============================================================================
  // COMPUTED VALUES
  // ==============================================================================
  // These values are recalculated every time the component renders.
  // We don't store them in state because they're derived from existing state.

  // Filter the full list of steps to only include ones that should be shown
  // based on the user's answers. For example, if they didn't select Orchestration Cluster,
  // we don't show the Orchestration Cluster database config step.
  const visibleSteps = wizardSteps.filter(step => {
    if (step.showIf) {
      return step.showIf(answers)
    }
    return true // Steps without showIf are always visible
  })

  const totalPages = visibleSteps.length
  
  // Get the data for whichever step we're currently on
  // Note: page is 1-based (human-friendly) but arrays are 0-based
  const currentStepData = visibleSteps[page - 1]


  // ==============================================================================
  // EVENT HANDLERS
  // ==============================================================================

  /**
   * Saves an answer to state whenever the user interacts with an input.
   * This gets called by QuestionRenderer components when values change.
   */
  const saveAnswer = (questionId, value) => {
    setAnswers({
      ...answers,
      [questionId]: value
    })

    // Special case: if they change their product selection, reset to page 1
    // This prevents being stranded on a step that no longer exists
    if (questionId === 'products') {
      setPage(1)
    }
  }

  /**
   * Navigate to the next step
   */
  function next() {
    if (page < totalPages) {
      setPage(page + 1)
    }
  }

  /**
   * Navigate to the previous step
   */
  function previous() {
    if (page > 1) {
      setPage(page - 1)
    }
  }


  // ==============================================================================
  // YAML CONFIGURATION BUILDER
  // ==============================================================================
  /**
   * Builds the final YAML configuration string based on all the answers.
   * 
   * How this works:
   * - Start with an empty string
   * - Check each possible configuration section
   * - If the user answered those questions, add that section to the output
   * - Use template strings to build properly indented YAML
   * 
   * The order matters here - we want global config at the top, then products,
   * then environment variables for each product.
   */
const generateYaml = () => {
  let config = ''

  const bothSelected = answers.products?.includes('Orchestration Cluster') && answers.products?.includes('Optimize')

  // Determine which database answers to use for Orchestration Cluster
  const ocDatabase = bothSelected ? answers.shared_database : answers.orchestration_cluster_database
  const ocEsUsername = bothSelected ? answers.shared_es_username : answers.orchestration_cluster_es_username
  const ocEsPassword = bothSelected ? answers.shared_es_password : answers.orchestration_cluster_es_password
  const ocEsProtocol = bothSelected ? answers.shared_es_protocol : answers.orchestration_cluster_es_protocol
  const ocEsHost = bothSelected ? answers.shared_es_host : answers.orchestration_cluster_es_host
  const ocOsUsername = bothSelected ? answers.shared_os_username : answers.orchestration_cluster_os_username
  const ocOsPassword = bothSelected ? answers.shared_os_password : answers.orchestration_cluster_os_password
  const ocOsProtocol = bothSelected ? answers.shared_os_protocol : answers.orchestration_cluster_os_protocol
  const ocOsHost = bothSelected ? answers.shared_os_host : answers.orchestration_cluster_os_host

  // Determine which database answers to use for Optimize
  const optDatabase = bothSelected ? answers.shared_database : answers.optimize_database
  const optEsUsername = bothSelected ? answers.shared_es_username : answers.optimize_es_username
  const optEsPassword = bothSelected ? answers.shared_es_password : answers.optimize_es_password
  const optEsProtocol = bothSelected ? answers.shared_es_protocol : answers.optimize_es_protocol
  const optEsHost = bothSelected ? answers.shared_es_host : answers.optimize_es_host
  const optOsUsername = bothSelected ? answers.shared_os_username : answers.optimize_os_username
  const optOsPassword = bothSelected ? answers.shared_os_password : answers.optimize_os_password
  const optOsProtocol = bothSelected ? answers.shared_os_protocol : answers.optimize_os_protocol
  const optOsHost = bothSelected ? answers.shared_os_host : answers.optimize_os_host

  // Global Elasticsearch block (driven by Orchestration Cluster selection)
  if (answers.products?.includes('Orchestration Cluster') && ocDatabase === 'Elasticsearch') {
    config += `global:
  elasticsearch:
    enabled: true
    external: true
    auth:
      username: "${ocEsUsername}"
      secret:
        password: "${ocEsPassword}"
    url:
      protocol: "${ocEsProtocol}"
      host: "${ocEsHost}"
      port: 9200
    clusterName: "elasticsearch"\n\n`
  }

  // Global OpenSearch block (driven by Orchestration Cluster selection)
  if (answers.products?.includes('Orchestration Cluster') && ocDatabase === 'OpenSearch') {
    config += `global:
  opensearch:
    enabled: true
    external: true
    auth:
      username: "${ocOsUsername}"
      secret:
        password: "${ocOsPassword}"
    url:
      protocol: "${ocOsProtocol}"
      host: "${ocOsHost}"
      port: 9200
    clusterName: "opensearch"\n\n`
  }

  // Optimize Elasticsearch block (only standalone)
  if (answers.products?.includes('Optimize') && !bothSelected && optDatabase === 'Elasticsearch') {
    config += `optimize:
  elasticsearch:
    enabled: true
    external: true
    auth:
      username: "${optEsUsername}"
      secret:
        password: "${optEsPassword}"
    url:
      protocol: "${optEsProtocol}"
      host: "${optEsHost}"
      port: 9200\n\n`
  }

  // Optimize OpenSearch block (only standalone)
  if (answers.products?.includes('Optimize') && !bothSelected && optDatabase === 'OpenSearch') {
    config += `optimize:
  opensearch:
    enabled: true
    external: true
    auth:
      username: "${optOsUsername}"
      secret:
        password: "${optOsPassword}"
    url:
      protocol: "${optOsProtocol}"
      host: "${optOsHost}"
      port: 9200\n\n`
  }

  // Web Modeler PostgreSQL config
  if (answers.products?.includes('Web Modeler') && answers.webmodeler_database === 'PostgreSQL') {
    config += `webModeler:
  restapi:
    externalDatabase:
      enabled: true
      url: "jdbc:postgresql://${answers.webmodeler_db_url}:5432/web-modeler"
      host: "${answers.webmodeler_db_host}"
      port: 5432
      database: "web-modeler"
      user: "${answers.webmodeler_db_user}"
      password: "${answers.webmodeler_db_password}"\n\n`
  }

  if (answers.console_env_vars && answers.console_env_vars.length > 0) {
    config += `console:\n  env:\n`
    answers.console_env_vars.forEach(env => {
      config += `    - name: ${env.name}\n      value: ${env.value}\n`
    })
    config += '\n'
  }

  if (answers.connectors_env_vars && answers.connectors_env_vars.length > 0) {
    config += `connectors:\n  env:\n`
    answers.connectors_env_vars.forEach(env => {
      config += `    - name: ${env.name}\n      value: ${env.value}\n`
    })
    config += '\n'
  }

  if (answers.orchestration_cluster_env_vars && answers.orchestration_cluster_env_vars.length > 0) {
    config += `orchestration:\n  env:\n`
    answers.orchestration_cluster_env_vars.forEach(env => {
      config += `    - name: ${env.name}\n      value: ${env.value}\n`
    })
    config += '\n'
  }

  if (answers.optimize_env_vars && answers.optimize_env_vars.length > 0) {
    config += `optimize:\n  env:\n`
    answers.optimize_env_vars.forEach(env => {
      config += `    - name: ${env.name}\n      value: ${env.value}\n`
    })
    config += '\n'
  }

  if (answers.management_identity_env_vars && answers.management_identity_env_vars.length > 0) {
    config += `Management Identity:\n  env:\n`
    answers.management_identity_env_vars.forEach(env => {
      config += `    - name: ${env.name}\n      value: ${env.value}\n`
    })
    config += '\n'
  }

  let webModelerEnvAdded = false

  if (answers.webmodeler_restapi_env_vars && answers.webmodeler_restapi_env_vars.length > 0) {
    if (!webModelerEnvAdded) { config += `webModeler:\n`; webModelerEnvAdded = true }
    config += `  restApi:\n    env:\n`
    answers.webmodeler_restapi_env_vars.forEach(env => {
      config += `      - name: ${env.name}\n        value: ${env.value}\n`
    })
  }

  if (answers.webmodeler_webapp_env_vars && answers.webmodeler_webapp_env_vars.length > 0) {
    if (!webModelerEnvAdded) { config += `webModeler:\n`; webModelerEnvAdded = true }
    config += `  webApp:\n    env:\n`
    answers.webmodeler_webapp_env_vars.forEach(env => {
      config += `      - name: ${env.name}\n        value: ${env.value}\n`
    })
  }

  if (answers.webmodeler_websocket_env_vars && answers.webmodeler_websocket_env_vars.length > 0) {
    if (!webModelerEnvAdded) { config += `webModeler:\n`; webModelerEnvAdded = true }
    config += `  websocket:\n    env:\n`
    answers.webmodeler_websocket_env_vars.forEach(env => {
      config += `      - name: ${env.name}\n        value: ${env.value}\n`
    })
  }

  setYamlOutput(config || 'No configuration generated yet...')
}


  // ==============================================================================
  // RENDER
  // ==============================================================================
  return (
    <main className="config-app">

      {/* Progress indicator at the top */}
      <header className='step-indicator'>
        <p>Step {page} Of {totalPages}</p>
      </header>

      {/* Main wizard content area */}
      <section className="wizard-content">
        <h2>{currentStepData.title}</h2>

        {currentStepData.questions.map(q => {
          // Skip questions that have a showIf condition that returns false
          if (q.showIf && !q.showIf(answers)) return null

          // Render the appropriate input type for this question
          return (
            <QuestionRenderer
              key={q.id}
              question={q}
              value={answers[q.id]}
              onChange={(val) => saveAnswer(q.id, val)}
            />
          )
        })}
      </section>

      {/* Live YAML output panel (fixed to bottom-left corner) */}
      <div className='output'>
        <pre>{yamlOutput || 'Config will appear here...'}</pre>
      </div>

      {/* Navigation buttons (fixed to sides, vertically centered) */}
      <nav className='app-navigation'>
        <button className="nav-button back-button" onClick={previous}>
          <i className="fa-solid fa-arrow-left arrow"></i>Back
        </button>
        <button className="nav-button next-button" onClick={next} disabled={page === totalPages}>
          Next<i className="fa-solid fa-arrow-right"></i>
        </button>
      </nav>

      {/* Generate button (fixed to bottom-right corner) */}
      <button className="generate-button" onClick={generateYaml}>Generate</button>

    </main>
  )
}


// ==============================================================================
// ENVIRONMENT VARIABLES MANAGER
// ==============================================================================
/**
 * A mini-component for managing environment variables for a product.
 * Users can add, edit, and delete name/value pairs.
 * 
 * This component maintains its own local state for the list of env vars,
 * but syncs changes back to the parent (App) via the onChange callback.
 * 
 * How it works:
 * - User fills in name and value, clicks "Done" → adds to list
 * - User clicks "Edit" on an existing var → populates form for editing
 * - User clicks "Update" → saves changes
 * - User clicks "Delete" → removes from list
 * - User clicks "New" → clears form to add another
 */
function EnvironmentVariablesManager({ productId, value, onChange }) {

  // Local state - this component manages its own list of env vars
  const [envVars, setEnvVars] = useState(value || [])
  
  // Track which item we're currently editing (null if adding new)
  const [editingIndex, setEditingIndex] = useState(null)
  
  // Current values in the input fields
  const [currentName, setCurrentName] = useState('')
  const [currentValue, setCurrentValue] = useState('')

  /**
   * Add a new environment variable to the list
   */
  const handleAdd = () => {
    // Don't add if either field is empty
    if (!currentName || !currentValue) return

    const newEnvVars = [...envVars, { name: currentName, value: currentValue }]
    setEnvVars(newEnvVars)
    onChange(newEnvVars) // Sync back to parent
    
    // Clear the form
    setCurrentName('')
    setCurrentValue('')
  }

  /**
   * Load an existing env var into the form for editing
   */
  const handleEdit = (index) => {
    setEditingIndex(index)
    setCurrentName(envVars[index].name)
    setCurrentValue(envVars[index].value)
  }

  /**
   * Save changes to an existing env var
   */
  const handleUpdate = () => {
    if (editingIndex === null) return

    const newEnvVars = [...envVars]
    newEnvVars[editingIndex] = { name: currentName, value: currentValue }
    setEnvVars(newEnvVars)
    onChange(newEnvVars)

    // Exit edit mode and clear form
    setEditingIndex(null)
    setCurrentName('')
    setCurrentValue('')
  }

  /**
   * Remove an env var from the list
   */
  const handleDelete = (index) => {
    const newEnvVars = envVars.filter((_, i) => i !== index)
    setEnvVars(newEnvVars)
    onChange(newEnvVars)
  }

  /**
   * Clear the form and exit edit mode (ready to add new)
   */
  const handleNew = () => {
    setEditingIndex(null)
    setCurrentName('')
    setCurrentValue('')
  }

  return (
    <div className="env-vars-manager">

      {/* List of existing environment variables */}
      <div className="env-vars-list">
        {envVars.map((env, index) => (
          <div key={index} className="env-var-item">
            <span><strong>{env.name}</strong> = {env.value}</span>
            <div className="env-var-actions">
              <button onClick={() => handleEdit(index)} className="edit-btn">Edit</button>
              <button onClick={() => handleDelete(index)} className="delete-btn">Delete</button>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit form */}
      <div className="env-var-form">
        <input
          type="text"
          placeholder="Name"
          value={currentName}
          onChange={(e) => setCurrentName(e.target.value)}
        />
        <input
          type="text"
          placeholder="Value"
          value={currentValue}
          onChange={(e) => setCurrentValue(e.target.value)}
        />

        <div className="env-form-buttons">
          {/* Show different button depending on whether we're adding or editing */}
          {editingIndex === null ? (
            <button onClick={handleAdd} className="done-btn">Done</button>
          ) : (
            <button onClick={handleUpdate} className="update-btn">Update</button>
          )}
          <button onClick={handleNew} className="new-btn">Clear</button>
        </div>
      </div>

    </div>
  )
}


// ==============================================================================
// QUESTION RENDERER
// ==============================================================================
/**
 * Renders the appropriate input type for a question.
 * 
 * This is a "dumb" component - it doesn't have any of its own state.
 * It just displays what it's told to display and reports changes back up
 * to the parent via the onChange callback.
 * 
 * Supported question types:
 * - radio: single selection from options
 * - checkbox: multiple selections from options
 * - text/password: single-line text input
 * - env_vars: special component for environment variables
 */
function QuestionRenderer({ question, value, onChange }) {

  // Radio buttons - user selects exactly one option
  if (question.type === 'radio') {
    return (
      <div className="question-wrapper">
        <label>{question.label}</label>
        <div className="radio-group">
          {question.options.map(opt => (
            <label key={opt}>
              <input
                type="radio"
                name={question.id}  // Groups radio buttons so only one can be selected
                value={opt}
                checked={value === opt}
                onChange={(e) => onChange(e.target.value)}
              />
              {opt}
            </label>
          ))}
        </div>
      </div>
    )
  }

  // Checkboxes - user can select multiple options
  if (question.type === 'checkbox') {
    return (
      <div className="question-wrapper">
        <label>{question.label}</label>
        <div className="checkbox-group">
          {question.options.map(opt => (
            <label key={opt}>
              <input
                type="checkbox"
                value={opt}
                checked={value?.includes(opt)} // value is an array for checkboxes
                onChange={(e) => {
                  const newValue = value || []
                  if (e.target.checked) {
                    // Add to array
                    onChange([...newValue, opt])
                  } else {
                    // Remove from array
                    onChange(newValue.filter(v => v !== opt))
                  }
                }}
              />
              {opt}
            </label>
          ))}
        </div>
      </div>
    )
  }

  // Text or password input - single line of text
  if (question.type === 'text' || question.type === 'password') {
    return (
      <div className="question-wrapper text-input">
        <label>{question.label}</label>
        <input
          type={question.type}
          value={value || ''}
          placeholder={question.placeholder || ''}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    )
  }

  // Environment variables - use the special manager component
  if (question.type === 'env_vars') {
    return (
      <div className="question-wrapper">
        <label>{question.label}</label>
        <EnvironmentVariablesManager
          productId={question.id}
          value={value}
          onChange={onChange}
        />
      </div>
    )
  }
}

export default App;