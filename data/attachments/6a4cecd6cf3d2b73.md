# Page snapshot

```yaml
- dialog "Unhandled Runtime Error" [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - navigation [ref=e7]:
          - button "previous" [disabled] [ref=e8]:
            - img "previous" [ref=e9]
          - button "next" [disabled] [ref=e11]:
            - img "next" [ref=e12]
          - generic [ref=e14]: 1 of 1 error
          - generic [ref=e15]:
            - text: Next.js (14.2.35) is outdated
            - link "(learn more)" [ref=e17] [cursor=pointer]:
              - /url: https://nextjs.org/docs/messages/version-staleness
        - button "Close" [ref=e18] [cursor=pointer]:
          - img [ref=e20]
      - heading "Unhandled Runtime Error" [level=1] [ref=e23]
      - paragraph [ref=e24]: "Error: Failed query: select \"user\".\"id\", \"user\".\"name\", \"user\".\"contact_email\", \"user\".\"contact_email\", \"user\".\"contacts\", \"user\".\"priorities_set\", \"signup_books\".\"book_id\", \"books\".\"title\", \"signup_books\".\"signed_at\", \"signup_books\".\"personal_status\", \"signup_books\".\"personal_status_updated_at\" from \"signup_books\" inner join \"user\" on \"signup_books\".\"user_id\" = \"user\".\"id\" inner join \"books\" on \"signup_books\".\"book_id\" = \"books\".\"id\" order by \"user\".\"name\" asc, \"signup_books\".\"signed_at\" asc, \"books\".\"title\" asc params:"
    - generic [ref=e25]:
      - heading "Source" [level=2] [ref=e26]
      - generic [ref=e27]:
        - link "lib/signup-books.ts (41:16) @ async getAllSignups" [ref=e29] [cursor=pointer]:
          - generic [ref=e30]: lib/signup-books.ts (41:16) @ async getAllSignups
          - img [ref=e31]
        - generic [ref=e35]: "39 | 40 | export async function getAllSignups(): Promise<UserSignup[]> { > 41 | const rows = await db | ^ 42 | .select({ 43 | userId: users.id, 44 | name: users.name,"
      - heading "Call Stack" [level=2] [ref=e36]
```