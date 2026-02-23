import '@testing-library/jest-dom'

// Polyfill Node.js globals missing from jsdom (required by @neondatabase/serverless)
import { TextDecoder, TextEncoder } from 'util'
Object.assign(global, { TextDecoder, TextEncoder })
