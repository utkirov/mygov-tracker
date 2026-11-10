import { linkPreviewImage, PREVIEW_SIZE } from '@/lib/card-images';
import { stageSummary } from '@/lib/checklist';
import { buildClientShareView, buildShareView, findShareLink, isShareLinkActive } from '@/lib/share-links';

/**
 * The picture Telegram/WhatsApp show for a share link: number, status, service
 * and stage — like the page itself. A PIN link or a dead one gets a plain card.
 */
export const size = PREVIEW_SIZE;
export const contentType = 'image/png';
export const alt = 'Статус заявления на my.gov.uz';

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await findShareLink(token);
  if (!link || !isShareLinkActive(link)) return linkPreviewImage({ kind: 'generic', text: 'Ссылка недоступна' });
  if (link.has_pin) return linkPreviewImage({ kind: 'generic', text: 'Статус заявления · по PIN-коду' });
  if (link.client_id) {
    const view = await buildClientShareView(link);
    const apps = view?.applications ?? [];
    return linkPreviewImage({ kind: 'client', active: apps.filter(a => !a.completed).length, total: apps.length });
  }
  const view = await buildShareView(link);
  if (!view) return linkPreviewImage({ kind: 'generic', text: 'Ссылка недоступна' });
  const step = view.checklist ? stageSummary(view.checklist) : null;
  return linkPreviewImage({
    kind: 'application',
    number: view.application_number,
    status: view.status,
    service: view.service_name,
    stage: step?.stage || view.current_action,
    stageLine: step?.stage && step.stageCount ? `Этап ${step.stageIndex} из ${step.stageCount}` : 'Сейчас',
  });
}
