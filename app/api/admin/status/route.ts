import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const REPO = 'bon2362/book-club'
const VERCEL_PROJECT_ID = 'prj_ZwWgPCcLf8RyrxeMJDI5zCX08dEp'

export async function GET() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ghToken = process.env.GH_TOKEN
  const vercelToken = process.env.VERCEL_TOKEN

  const [ciResult, deployResult] = await Promise.allSettled([
    ghToken
      ? fetch(`https://api.github.com/repos/${REPO}/actions/runs?per_page=1`, {
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: 'application/vnd.github+json',
          },
          next: { revalidate: 0 },
        }).then(r => r.json())
      : Promise.reject(new Error('No GH_TOKEN')),

    vercelToken
      ? fetch(`https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&limit=1`, {
          headers: { Authorization: `Bearer ${vercelToken}` },
          next: { revalidate: 0 },
        }).then(r => r.json())
      : Promise.reject(new Error('No VERCEL_TOKEN')),
  ])

  const ci =
    ciResult.status === 'fulfilled' && ciResult.value.workflow_runs?.[0]
      ? (() => {
          const run = ciResult.value.workflow_runs[0]
          return {
            status: run.status as string,
            conclusion: run.conclusion as string | null,
            name: run.name as string,
            sha: (run.head_sha as string).slice(0, 7),
            branch: run.head_branch as string,
            url: run.html_url as string,
            createdAt: run.created_at as string,
          }
        })()
      : null

  const deploy =
    deployResult.status === 'fulfilled' && deployResult.value.deployments?.[0]
      ? (() => {
          const d = deployResult.value.deployments[0]
          return {
            state: d.state as string,
            url: d.url as string,
            sha: d.meta?.githubCommitSha
              ? (d.meta.githubCommitSha as string).slice(0, 7)
              : null,
            createdAt: d.createdAt as number,
          }
        })()
      : null

  return NextResponse.json({ ci, deploy })
}
