import { FormEvent, useState } from 'react';
import { X } from 'lucide-react';
import { createAthlete } from '../../api/client';
import type { CreateAthletePayload } from '../../types';
import { Spinner } from '../ui/Spinner';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function AthleteForm({ onClose, onCreated }: Props) {
  const [form, setForm] = useState<CreateAthletePayload>({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: 'unspecified',
    school: '',
    club: '',
    category: '',
    consentStatus: 'pending',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof CreateAthletePayload>(
    key: K,
    value: CreateAthletePayload[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('First and last name are required');
      return;
    }
    setSubmitting(true);
    try {
      const payload: CreateAthletePayload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender,
        school: form.school?.trim() || undefined,
        club: form.club?.trim() || undefined,
        category: form.category?.trim() || undefined,
        consentStatus: form.consentStatus,
        notes: form.notes?.trim() || undefined,
      };
      await createAthlete(payload);
      onCreated();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Failed to create athlete';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">New athlete</h2>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">First name *</label>
              <input
                className="input"
                value={form.firstName}
                onChange={(e) => update('firstName', e.target.value)}
                required
                disabled={submitting}
              />
            </div>
            <div>
              <label className="label">Last name *</label>
              <input
                className="input"
                value={form.lastName}
                onChange={(e) => update('lastName', e.target.value)}
                required
                disabled={submitting}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Date of birth</label>
              <input
                type="date"
                className="input"
                value={form.dateOfBirth}
                onChange={(e) => update('dateOfBirth', e.target.value)}
                disabled={submitting}
              />
            </div>
            <div>
              <label className="label">Gender</label>
              <select
                className="input"
                value={form.gender}
                onChange={(e) =>
                  update('gender', e.target.value as CreateAthletePayload['gender'])
                }
                disabled={submitting}
              >
                <option value="unspecified">Unspecified</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">School</label>
              <input
                className="input"
                value={form.school}
                onChange={(e) => update('school', e.target.value)}
                disabled={submitting}
              />
            </div>
            <div>
              <label className="label">Club</label>
              <input
                className="input"
                value={form.club}
                onChange={(e) => update('club', e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Category</label>
              <input
                className="input"
                placeholder="e.g. U16, Senior"
                value={form.category}
                onChange={(e) => update('category', e.target.value)}
                disabled={submitting}
              />
            </div>
            <div>
              <label className="label">Consent status</label>
              <select
                className="input"
                value={form.consentStatus}
                onChange={(e) =>
                  update(
                    'consentStatus',
                    e.target.value as CreateAthletePayload['consentStatus']
                  )
                }
                disabled={submitting}
              >
                <option value="pending">Pending</option>
                <option value="granted">Granted</option>
                <option value="revoked">Revoked</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea
              className="input min-h-[80px] resize-y"
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              disabled={submitting}
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner className="h-4 w-4" />
                  Creating…
                </>
              ) : (
                'Create athlete'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
