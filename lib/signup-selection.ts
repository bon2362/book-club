import { NextResponse } from 'next/server'
import { previewSignupByBookIds, upsertSignupByBookIds } from '@/lib/signup-books'
import { notificationQueue, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { bestEffortRecordUserActivity, buildUserActivityDedupeKey } from '@/lib/user-activity'
import { getUserContactEmail } from '@/lib/user-email'
import { broadcastActiveMatchingStateChangeForParticipant, getActiveMatchingSessionIdForParticipant } from '@/lib/matching/realtime/state-change'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { transitionError } from '@/lib/matching/transition-http'

export type AuthSession = { user: { id: string; name?: string | null; contactEmail?: string | null; email?: string | null } }
export interface SignupSelectionInput { name: string; contacts: string; selectedBookIds: string[] }
export async function saveSignupSelection(session: AuthSession, input: SignupSelectionInput): Promise<NextResponse> {
  const pgUserId=session.user.id; const {name,contacts,selectedBookIds}=input; const activeSessionId=await getActiveMatchingSessionIdForParticipant(pgUserId); const auditCtx={actorUserId:pgUserId,actorLabel:session.user.name??session.user.contactEmail??null,source:'signup' as const}; let result
  try { if(activeSessionId){result=await previewSignupByBookIds(pgUserId,selectedBookIds);await runMatchingTransition({sessionId:activeSessionId,actor:{userId:pgUserId,label:session.user.name??session.user.contactEmail??null,source:'catalog'},action:{type:'replace_signup',userId:pgUserId,name:name.trim(),contacts:contacts.trim(),bookIds:result.addedBookIds}})}else result=await withAuditContext(auditCtx,async tx=>{const upsert=await upsertSignupByBookIds(pgUserId,selectedBookIds,tx);await tx.update(users).set({name:name.trim(),contacts:contacts.trim(),...(upsert.addedBookIds.length===0?{prioritiesSet:false}:{})}).where(eq(users.id,pgUserId));return upsert}) } catch(error) { if(activeSessionId&&!(error instanceof Error&&error.message==='BOOK_ID_NOT_FOUND'))return transitionError(error);return NextResponse.json({error:'Some books were not found'},{status:400}) }
  await bestEffortRecordUserActivity(pgUserId,'profile_submitted',{source:'api',sourceId:pgUserId,dedupeKey:buildUserActivityDedupeKey(['api','profile_submitted',pgUserId,name.trim(),contacts.trim(),JSON.stringify(result.addedBookIds)]),metadata:{selectedBooksCount:result.addedBookIds.length,addedBooksCount:result.addedBooks.length}})
  if(result.addedBookIds.length>0)await bestEffortRecordUserActivity(pgUserId,'books_selected',{source:'api',sourceId:pgUserId,dedupeKey:buildUserActivityDedupeKey(['api','books_selected',pgUserId,JSON.stringify(result.addedBookIds)]),metadata:{selectedBooksCount:result.addedBookIds.length,addedBooksCount:result.addedBooks.length}})
  if(result.addedBooks.length>0&&process.env.NEXTAUTH_TEST_MODE!=='true')withAuditContext(auditCtx,tx=>tx.insert(notificationQueue).values({userName:name.trim(),userEmail:getUserContactEmail(session.user)??'',contacts:contacts.trim(),addedBooks:JSON.stringify(result.addedBooks),isNew:result.isNew})).catch(()=>console.error('Failed to enqueue signup notification'))
  if(!activeSessionId)await broadcastActiveMatchingStateChangeForParticipant(pgUserId);return NextResponse.json({ok:true})
}
