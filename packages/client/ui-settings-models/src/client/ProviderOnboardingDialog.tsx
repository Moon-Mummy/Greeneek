/**
 * First-run provider setup. Readiness comes from the same
 * provider/settings/credential join as the Models page: any provider the user
 * can already talk to ends the step, and only a user with none is asked for a
 * key. The step reuses that page's credential editor in the onboarding
 * plugin's shared modal, so the key is entered once.
 *
 * The provider is chosen here rather than fixed by the build. This harness
 * ships no provider of its own — every route is one the user's own API key
 * activates — so the step offers the configurable directory and lets the user
 * pick, which is also what keeps it correct as adapters are added or removed
 * from a composition.
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { SnapshotStore } from '@greeneek/gnk-client-store'
import type { InjectFace, PropsRuntime } from '@greeneek/gnk-client-ui-slots'
import type { ModelsSettingsState, ModelsSettingsStore, ProviderRow } from './store.ts'
import { onboardingReadiness, providerSetupCandidate } from './store.ts'
import type { ModelsOperations } from './operations.ts'
import type { SettingsSchemaOperations } from './schema-operations.ts'
import { ProviderEditor } from './ProviderEditor.tsx'
import type { en } from './locales.ts'
import { OnboardingModal } from './OnboardingModal.tsx'
import styles from './ProviderOnboardingDialog.module.css'
import sectionStyles from './ModelsSection.module.css'

/** Registration-side dependencies of {@link ProviderOnboardingDialog}. */
export interface ProviderOnboardingInjected {
  hooks: {
    /** Shared Models-page join state, bound by the slot renderer. */
    models: SnapshotStore<ModelsSettingsState>
  }
  /** Shared Models-page join controller. */
  controller: ModelsSettingsStore
  /** The Host operations the reused Models credential editor writes through. */
  operations: ModelsOperations
  /** Settings schema and immutable path callbacks. */
  schema: SettingsSchemaOperations
  /** Feature copy. */
  t: (key: keyof typeof en) => string
}

/** Slot owner props plus the feature's injected dependencies. */
export type ProviderOnboardingDialogProps =
  PropsRuntime<'settings.onboarding'> & InjectFace<ProviderOnboardingInjected>

/* v8 ignore next 3 -- closed-union defaults only defend future source widening */
function assertNever(_value: never): never {
  throw new Error('unexpected provider onboarding state')
}

/**
 * The provider the step opens on: the first candidate the directory lists.
 * Directory order is the adapter's own, which is the order the Models page
 * shows, so the preselection matches what the user would read as first.
 * @param candidates - offerable rows in directory order.
 * @returns the route id to preselect, or undefined when none is offerable.
 */
export function initialOnboardingProvider(candidates: readonly ProviderRow[]): string | undefined {
  return candidates[0]?.entry.provider
}

/**
 * Prompt a first-run user for a provider credential while no provider can
 * serve requests and some credential is writable.
 * @param props - settings-shell owner state and Models feature dependencies.
 * @returns the onboarding modal or null when onboarding needs no intervention.
 */
export function ProviderOnboardingDialog(props: ProviderOnboardingDialogProps): ReactNode {
  const { complete, controller, useModels, operations, schema, t } = props
  const state = useModels(snapshot => snapshot)
  const readiness = onboardingReadiness(state)
  const [chosen, setChosen] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (state.status === 'idle') void controller.load()
  }, [controller, state.status])

  useEffect(() => {
    if (
      readiness.kind === 'adapter-absent'
      || readiness.kind === 'provider-ready'
      || readiness.kind === 'unavailable'
    ) complete()
  }, [complete, readiness.kind])

  switch (readiness.kind) {
    case 'loading':
    case 'adapter-absent':
    case 'provider-ready':
    case 'unavailable':
      return null
    case 'credential-missing':
      break
    /* v8 ignore next -- every current readiness variant is handled above */
    default:
      return assertNever(readiness)
  }

  const candidates = state.rows.filter(providerSetupCandidate)
  const selected = chosen ?? initialOnboardingProvider(candidates)
  const row = candidates.find(candidate => candidate.entry.provider === selected)
  /* v8 ignore next 2 -- credential-missing is derived from a non-empty candidate list. */
  if (row === undefined) return null
  const namespace = state.namespaces.get(row.entry.settingsNs)
  /* v8 ignore next -- a joined row always carries a resolved namespace. */
  if (namespace === undefined) return null

  const finishCredential = (changed: boolean): void => {
    if (!changed) {
      complete()
      return
    }
    void controller.load()
  }

  return (
    <OnboardingModal title={t('onboardingTitle')}>
      <p className={styles.description}>{t('onboardingDescription')}</p>
      <div className={styles.editor}>
        <div className={sectionStyles['field']}>
          <span className={sectionStyles['fieldLabel']}>{t('provider')}</span>
          <select
            className={`${sectionStyles['input']} ${sectionStyles['selectInput']}`}
            value={row.entry.provider}
            aria-label={t('provider')}
            onChange={(event) => { setChosen(event.target.value) }}
          >
            {candidates.map(candidate => (
              <option key={candidate.entry.provider} value={candidate.entry.provider}>
                {candidate.entry.displayName}
              </option>
            ))}
          </select>
        </div>
        <ProviderEditor
          // Remount per provider: the editor holds the draft and credential
          // state of the route it opened on, which a switch must not carry.
          key={row.entry.provider}
          provider={row.entry.provider}
          displayName={row.entry.displayName}
          namespace={namespace}
          schema={schema}
          settingsPath={row.entry.settingsPath}
          operations={operations}
          t={t}
          readOnly={false}
          hideTitle
          credentialOnly
          credentialRequired
          autoFocusCredential
          cancelLabelKey="onboardingLater"
          submitLabelKey="onboardingSave"
          submitBusyLabelKey="onboardingSaving"
          onClose={finishCredential}
        />
      </div>
    </OnboardingModal>
  )
}
