import { NavLink, useParams, Navigate } from 'react-router-dom'
import clsx from 'clsx'
import termsDoc from '@/legal/terms.md?raw'
import rulesDoc from '@/legal/rules.md?raw'
import privacyDoc from '@/legal/privacy.md?raw'
import Markdown from '@/components/shared/Markdown'
import { Card, Container } from '@/components/ui'

const DOCS = {
  terms:   { label: 'Terms of Service', source: termsDoc },
  rules:   { label: 'Community Rules',  source: rulesDoc },
  privacy: { label: 'Privacy Policy',   source: privacyDoc },
} as const

type DocKey = keyof typeof DOCS

/**
 * One component for all three documents. They are bundled at build
 * time with `?raw`, so they render for signed-out visitors and stay
 * readable if the database is unreachable — which matters, because
 * these are the pages someone goes looking for when something has
 * gone wrong.
 */
export default function LegalPage() {
  const { doc } = useParams<{ doc: DocKey }>()

  if (!doc || !(doc in DOCS)) return <Navigate to="/legal/terms" replace />

  const active = DOCS[doc as DocKey]

  return (
    <Container className="max-w-3xl">
      <nav className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(DOCS) as DocKey[]).map((key) => (
          <NavLink
            key={key}
            to={`/legal/${key}`}
            className={({ isActive }) =>
              clsx(
                'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-slate-800 dark:text-slate-300',
              )
            }
          >
            {DOCS[key].label}
          </NavLink>
        ))}
      </nav>

      <Card className="!p-6 sm:!p-8">
        <Markdown source={active.source} />
      </Card>
    </Container>
  )
}
