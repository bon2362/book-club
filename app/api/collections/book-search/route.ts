export const dynamic='force-dynamic'
import { NextRequest,NextResponse } from 'next/server';import { auth } from '@/lib/auth';import { searchPublishedBooks } from '@/lib/collections/repo';import { collectionErrorResponse } from '@/lib/collections/http'
export async function GET(req:NextRequest){const session=await auth();if(!session?.user?.id)return NextResponse.json({error:'Unauthorized'},{status:401});try{return NextResponse.json({books:await searchPublishedBooks(new URL(req.url).searchParams.get('q')??'')})}catch(error){return collectionErrorResponse(error)}}
