# Page snapshot

```yaml
- generic [active]:
  - alert [ref=e1]
  - dialog "Server Error" [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - navigation [ref=e8]:
          - button "previous" [disabled] [ref=e9]:
            - img "previous" [ref=e10]
          - button "next" [disabled] [ref=e12]:
            - img "next" [ref=e13]
          - generic [ref=e15]: 1 of 1 error
          - generic [ref=e16]:
            - text: Next.js (14.2.35) is outdated
            - link "(learn more)" [ref=e18] [cursor=pointer]:
              - /url: https://nextjs.org/docs/messages/version-staleness
        - heading "Server Error" [level=1] [ref=e19]
        - paragraph [ref=e20]: "TypeError: Cannot read properties of null (reading 'useContext')"
        - generic [ref=e21]: This error happened while generating the page. Any console logs will be displayed in the terminal window.
      - generic [ref=e22]:
        - heading "Call Stack" [level=2] [ref=e23]
        - group [ref=e24]:
          - generic "Next.js" [ref=e25] [cursor=pointer]:
            - img [ref=e26]
            - img [ref=e28]
            - text: Next.js
        - generic [ref=e33]:
          - heading "PathnameContext" [level=3] [ref=e34]
          - generic [ref=e36]: webpack:/src/client/components/navigation.ts
        - generic [ref=e37]:
          - heading "ErrorBoundary" [level=3] [ref=e38]
          - generic [ref=e40]: webpack:/src/client/components/error-boundary.tsx
        - group [ref=e41]:
          - generic "Next.js" [ref=e42] [cursor=pointer]:
            - img [ref=e43]
            - img [ref=e45]
            - text: Next.js
```