import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Dialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  IconButton,
  Input,
  MoneyText,
  PageHeader,
  Select,
  Skeleton,
  Spinner,
  Textarea,
  Tooltip,
  useToast,
} from '@/components/ui';

interface DemoRow {
  id: string;
  service: string;
  amount: number;
}

const ROWS: DemoRow[] = [
  { id: '1', service: 'Mt Fuji Tour', amount: 542_500 },
  { id: '2', service: 'Airport Transfer', amount: 312_500 },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mb-6">
      <CardHeader title={title} />
      <CardBody className="flex flex-wrap items-start gap-4">{children}</CardBody>
    </Card>
  );
}

/** Dev-only visual review of every shared component in its states. */
export function ComponentGallery() {
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <PageHeader title="Component gallery" description="Dev only. Every shared UI component." />

      <Section title="Button">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button loading>Loading</Button>
        <Button disabled>Disabled</Button>
        <Button size="sm">Small</Button>
        <Button size="lg">Large</Button>
        <IconButton aria-label="Sparkle">
          <Sparkles aria-hidden="true" className="h-4 w-4" />
        </IconButton>
      </Section>

      <Section title="Badge">
        <Badge>Neutral</Badge>
        <Badge tone="success">Success</Badge>
        <Badge tone="warning">Warning</Badge>
        <Badge tone="danger">Danger</Badge>
        <Badge tone="info">Info</Badge>
      </Section>

      <Section title="Alert">
        <div className="w-full space-y-3">
          <Alert tone="info" title="Heads up">
            Rates change only for new quotations.
          </Alert>
          <Alert tone="success" title="Saved">
            Your quotation was saved.
          </Alert>
          <Alert tone="warning" title="Not booked yet">
            The output carries the availability disclaimer.
          </Alert>
          <Alert tone="danger" title="Could not save">
            Check your connection and try again.
          </Alert>
        </div>
      </Section>

      <Section title="Form controls">
        <div className="grid w-full gap-4 sm:grid-cols-2">
          <Field label="Client name" hint="As it should appear on the quotation.">
            <Input placeholder="Juan dela Cruz" />
          </Field>
          <Field label="Email" error="That address is not valid.">
            <Input defaultValue="not-an-email" />
          </Field>
          <Field label="Hotel category" required>
            <Select defaultValue="4">
              <option value="3">3 star</option>
              <option value="4">4 star</option>
              <option value="5">5 star</option>
            </Select>
          </Field>
          <Field label="Notes" hint="Shown to the agent only.">
            <Textarea placeholder="Internal notes…" />
          </Field>
          <Field label="Disabled">
            <Input disabled defaultValue="Read only" />
          </Field>
          <div className="flex items-end">
            <Checkbox label="Entrance ticket" />
          </div>
        </div>
      </Section>

      <Section title="Money, spinner, skeleton, tooltip">
        <MoneyText centavos={1_909_900} />
        <MoneyText centavos={null} />
        <Spinner label="Loading" />
        <Skeleton className="h-4 w-32" />
        <Tooltip label="Rates are frozen per quotation">
          <Button variant="secondary">Hover me</Button>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="secondary">Menu</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Duplicate</DropdownMenuItem>
            <DropdownMenuItem danger>Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Section>

      <Section title="Toasts">
        <Button
          onClick={() => {
            toast.success('Quotation saved.');
          }}
        >
          Success
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            toast.error('Could not reach Supabase.');
          }}
        >
          Error
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            toast.info('Rates were refreshed.');
          }}
        >
          Info
        </Button>
      </Section>

      <Section title="Dialogs">
        <Button
          onClick={() => {
            setDialogOpen(true);
          }}
        >
          Open dialog
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            setConfirmOpen(true);
          }}
        >
          Confirm dialog
        </Button>
        <Dialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="A plain dialog"
          description="Radix gives us the focus trap, Escape and scroll lock."
          footer={
            <Button
              onClick={() => {
                setDialogOpen(false);
              }}
            >
              Close
            </Button>
          }
        />
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Archive this quotation?"
          message="It stays in the audit log and can be found again later."
          confirmLabel="Archive"
          danger
          onConfirm={async () => {
            await new Promise((resolve) => setTimeout(resolve, 800));
            toast.success('Archived.');
          }}
        />
      </Section>

      <Section title="DataTable">
        <div className="w-full space-y-6">
          <DataTable
            caption="Services with rates"
            rows={ROWS}
            rowKey={(row) => row.id}
            columns={[
              { key: 'service', header: 'Service', cell: (row) => row.service },
              {
                key: 'amount',
                header: 'Per person',
                align: 'right',
                cell: (row) => <MoneyText centavos={row.amount} />,
              },
            ]}
          />
          <DataTable
            caption="Loading example"
            rows={[]}
            loading
            rowKey={(row: DemoRow) => row.id}
            columns={[
              { key: 'service', header: 'Service', cell: (row) => row.service },
              { key: 'amount', header: 'Per person', align: 'right', cell: () => null },
            ]}
          />
          <DataTable
            caption="Empty example"
            rows={[]}
            rowKey={(row: DemoRow) => row.id}
            empty={<EmptyState title="No quotations yet" text="Create one to get started." />}
            columns={[
              { key: 'service', header: 'Service', cell: (row) => row.service },
              { key: 'amount', header: 'Per person', align: 'right', cell: () => null },
            ]}
          />
        </div>
      </Section>

      <Section title="EmptyState">
        <div className="w-full">
          <EmptyState
            title="Nothing to show"
            text="When there is no data, say so plainly and offer the next step."
            action={<Button>Create one</Button>}
          />
        </div>
      </Section>
    </>
  );
}
