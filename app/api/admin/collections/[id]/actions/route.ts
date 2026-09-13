import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { collectionAuditContext, collectionErrorResponse, requireAdminSession } from '@/lib/collections/http'
import { applyAdminCollectionAction, serializeCollection } from '@/lib/collections/repo'
import { ADMIN_COLLECTION_ACTIONS, type AdminCollectionAction } from '@/lib/collections/types'
export const dynamic = 'force-dynamic'
export async function POST(req:NextRequest,{params}:{params:{id:string}}){const {session,forbidden}=await requireAdminSession(auth);if(forbidden)return forbidden;const body=await req.json().catch(()=>({})) as {action?:unknown;reason?:unknown};if(!ADMIN_COLLECTION_ACTIONS.includes(body.action as AdminCollectionAction))return NextResponse.json({error:'validation',issues:['invalid_action']},{status:400});try{const record=await withAuditContext(collectionAuditContext(session,'admin'),tx=>applyAdminCollectionAction(tx as never,{id:params.id,action:body.action as AdminCollectionAction,reason:typeof body.reason==='string'?body.reason:null,now:new Date()}));return NextResponse.json({collection:serializeCollection(record)})}catch(error){return collectionErrorResponse(error)}}
