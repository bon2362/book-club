import { NextResponse, type NextRequest } from 'next/server'
import type { AuthSession } from '@/lib/signup-selection'
import { CollectionError, isMissingCollectionsSchemaError, type CollectionErrorCode } from './errors'
import type { CollectionSnapshot, CollectionViewer } from './types'
const statuses: Record<CollectionErrorCode,number>={not_found:404,forbidden:403,invalid_transition:409,validation:400,book_not_published:400,migration_required:409}
export function collectionErrorResponse(error:unknown){if(error instanceof CollectionError)return NextResponse.json({error:error.code,...error.details},{status:statuses[error.code]});if(isMissingCollectionsSchemaError(error))return NextResponse.json({error:'migration_required'},{status:409});console.error('collections route failed',error);return NextResponse.json({error:'collections_failed'},{status:500})}
export const collectionAuditContext=(session:AuthSession,source:'collections'|'admin')=>({actorUserId:session.user.id,actorLabel:session.user.name??session.user.contactEmail??null,source})
export const viewerFromSession=(session:{user?:{id?:string|null;isAdmin?:boolean|null}|null}|null|undefined):CollectionViewer=>({userId:session?.user?.id??null,isAdmin:Boolean(session?.user?.isAdmin)})
export async function readContentBody(req:NextRequest):Promise<CollectionSnapshot>{const body=await req.json().catch(()=>null) as Record<string,unknown>|null;if(!body)throw new CollectionError('validation',{issues:['invalid_body']});const string=(v:unknown)=>typeof v==='string'?v:'';return{title:string(body.title),descriptionMarkdown:string(body.descriptionMarkdown),displayName:string(body.displayName),bookIds:Array.isArray(body.bookIds)?body.bookIds.filter((id):id is string=>typeof id==='string'):[]}}
