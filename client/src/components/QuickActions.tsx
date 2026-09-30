import { Camera, HandCoins, Receipt, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './ui';

/**
 * The four things team members do most. Each opens the right page with its
 * form already open (?new=1), so "Add expense" is two taps from anywhere.
 */
export function QuickActions({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const go = (path: string) => {
    onClose();
    navigate(path);
  };
  const actions = [
    { label: 'Add expense', hint: 'Money spent for the event', icon: Receipt, path: '/app/expenses?new=1' },
    { label: 'Add contribution', hint: 'Your payment + screenshot', icon: HandCoins, path: '/app/contributions?new=1' },
    { label: 'Upload photos', hint: 'From camera or gallery', icon: Camera, path: '/app/photos?upload=1' },
    { label: 'Upload video', hint: 'Short clips from the event', icon: Video, path: '/app/videos?upload=1' },
  ];
  return (
    <Modal open={open} onClose={onClose} title="What would you like to add?" size="sm">
      <div className="grid grid-cols-2 gap-3 pb-2">
        {actions.map(({ label, hint, icon: Icon, path }) => (
          <button
            key={label}
            onClick={() => go(path)}
            className="flex flex-col items-start gap-2 rounded-2xl border border-line p-4 text-left hover:border-brand-300 hover:bg-brand-50"
          >
            <span className="rounded-xl bg-brand-100 p-2 text-brand-700">
              <Icon className="size-5" />
            </span>
            <span className="font-medium">{label}</span>
            <span className="text-xs text-muted">{hint}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
