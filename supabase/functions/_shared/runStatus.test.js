import { describe, it, expect } from 'vitest'
import { runStatus } from './runStatus.js'

const run = (created_at, status, conclusion = null) => ({ created_at, status, conclusion })
const SINCE = '2026-10-16T09:00:00Z'

describe('runStatus', () => {
  it('attend tant qu’aucune capture n’a démarré depuis le clic', () => {
    expect(runStatus([], SINCE)).toBe('waiting')
    expect(runStatus([run('2026-10-16T08:50:00Z', 'completed', 'success')], SINCE)).toBe('waiting')
  })

  it('attend une capture en file chez GitHub', () => {
    expect(runStatus([run('2026-10-16T09:00:05Z', 'queued')], SINCE)).toBe('waiting')
  })

  it('suit une capture en cours', () => {
    expect(runStatus([run('2026-10-16T09:00:05Z', 'in_progress')], SINCE)).toBe('running')
  })

  it('annonce la fin dès qu’une capture lancée depuis le clic a réussi', () => {
    expect(runStatus([run('2026-10-16T09:00:05Z', 'completed', 'success')], SINCE)).toBe('success')
  })

  // GitHub ne garde qu'une capture en attente : celle d'un autre joueur peut remplacer la nôtre,
  // annulée. Elle couvre tout le monde, on la suit.
  it('ignore une capture annulée et suit celle qui l’a remplacée', () => {
    const runs = [run('2026-10-16T09:00:05Z', 'completed', 'cancelled'), run('2026-10-16T09:00:20Z', 'in_progress')]
    expect(runStatus(runs, SINCE)).toBe('running')
  })

  it('attend encore quand la seule capture a été annulée', () => {
    expect(runStatus([run('2026-10-16T09:00:05Z', 'completed', 'cancelled')], SINCE)).toBe('waiting')
  })

  it('signale l’échec d’une capture', () => {
    expect(runStatus([run('2026-10-16T09:00:05Z', 'completed', 'failure')], SINCE)).toBe('failure')
  })

  it('préfère une réussite à un échec antérieur', () => {
    const runs = [run('2026-10-16T09:00:05Z', 'completed', 'failure'), run('2026-10-16T09:01:00Z', 'completed', 'success')]
    expect(runStatus(runs, SINCE)).toBe('success')
  })

  // L'horloge du navigateur peut avancer de quelques secondes sur celle de GitHub.
  it('tolère quelques secondes d’écart d’horloge', () => {
    expect(runStatus([run('2026-10-16T08:59:50Z', 'in_progress')], SINCE)).toBe('running')
  })
})
