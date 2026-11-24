import type {LayoutProps} from 'sanity'
import {BulkDeleteHost} from './BulkDelete'
import {UpdateNoticeLayout} from './UpdateNotice'

/** The studio's layout: the reload notice for new deploys, plus the bulk delete dialog. */
export function StudioLayout(props: LayoutProps) {
  return (
    <>
      <UpdateNoticeLayout {...props} />
      <BulkDeleteHost />
    </>
  )
}
