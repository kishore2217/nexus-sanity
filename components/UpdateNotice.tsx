// @sanity/ui v4 serves the toast API from its own subpath, not the package root.
import {Button, Stack, Text} from '@sanity/ui'
import {useToast} from '@sanity/ui/toast'
import {useEffect} from 'react'
import type {LayoutProps} from 'sanity'

/** Written by scripts/write-build-version.mjs on every build. Served uncached. */
const VERSION_URL = '/version.json'
const POLL_MS = 60_000

async function fetchBuild(): Promise<string | null> {
  try {
    const res = await fetch(VERSION_URL, {cache: 'no-store'})
    if (!res.ok) return null
    const {build} = (await res.json()) as {build?: unknown}
    return typeof build === 'string' ? build : null
  } catch {
    // Offline, or `sanity dev` (no version file): nothing to compare, try again later.
    return null
  }
}

/**
 * Wraps the studio layout and offers a reload once a newer build is deployed — e.g. after Nexus
 * adds a page or layout and CI rebuilds the studio with its schema. Documents of known types
 * already update live, so this is the only time an editor needs to reload, and they choose when.
 */
export function UpdateNoticeLayout(props: LayoutProps) {
  const toast = useToast()

  useEffect(() => {
    let loaded: string | null = null
    let stopped = false
    let notified = false

    const check = async () => {
      // The first check runs even in a background tab: it records the build this tab runs.
      if (notified || (loaded !== null && document.hidden)) return
      const build = await fetchBuild()
      if (stopped || !build) return
      if (loaded === null) {
        loaded = build
        return
      }
      if (build === loaded) return
      notified = true
      toast.push({
        id: 'studio-update',
        status: 'info',
        title: 'New version available',
        description: (
          <Stack gap={3}>
            <Text size={1}>Pages or layouts changed in Nexus. Reload to see them.</Text>
            <Button
              text="Reload"
              tone="primary"
              fontSize={1}
              padding={2}
              onClick={() => window.location.reload()}
            />
          </Stack>
        ),
        closable: true,
        // Stays until dismissed: an editor mid-edit decides when to reload.
        duration: Infinity,
      })
    }

    void check()
    const timer = window.setInterval(check, POLL_MS)
    // Check as soon as the editor comes back to the tab instead of waiting for the next tick.
    const onVisible = () => !document.hidden && void check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [toast])

  return props.renderDefault(props)
}
