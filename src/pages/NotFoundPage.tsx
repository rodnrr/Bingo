import { Button, Card, Container } from '@/components/ui'

export default function NotFoundPage() {
  return (
    <Container className="max-w-md">
      <Card className="text-center">
        <h1 className="text-3xl font-bold">404</h1>
        <p className="mt-2 text-sm text-fg-muted">
          That page is not here. It may have been a listing that has since been removed.
        </p>
        <Button to="/browse" className="mt-5">Back to browse</Button>
      </Card>
    </Container>
  )
}
