import { makeColors } from './make-colors.js'

// Abyssal indigo-green surfaces, fluorescent cyan used sparingly as the accent.
// Dark only: the control room has no daylight.
export const palette = makeColors({
  label: 'Abyssal Helm',
  only: 'dark',
  roles: {
    accent: '#2ee6d6', // keywords, focus, links: the sonar cyan
    success: '#4cc38a', // strings, added lines
    danger: '#ff6b6b', // errors, removed lines
    warning: '#f0b352', // variables, warnings
    pro: '#8b8cf6', // literals: deep-sea indigo
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#07121a',
        'surface-1': '#0b1820',
        'surface-2': '#0e1d26',
        'surface-3': '#11212b',
        'text-primary': '#e2f1f3',
        'text-secondary': '#a8c3c9',
        'text-muted': '#83a0a8',
      },
    },
    git: {
      added: '#4cc38a',
      removed: '#ff6b6b',
      modified: '#f0b352',
      merged: '#8b8cf6',
    },
  },
})
