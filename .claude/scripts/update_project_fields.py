#!/usr/bin/env python3
"""Заполняет поля Epic, Priority, Size, Status в GitHub Project на основе labels."""
import json, subprocess, os, sys, time

TOKEN = subprocess.check_output(
    "grep GH_TOKEN /workspace/.env.local | cut -d= -f2", shell=True, text=True
).strip()
REPO = "bon2362/book-club"
PROJECT_ID = "PVT_kwHOA8w2B84BSWWj"

env = {**os.environ, "GH_TOKEN": TOKEN}

# Field и option IDs из GraphQL запроса
FIELDS = {
    "Status":   "PVTSSF_lAHOA8w2B84BSWWjzg_6RJw",
    "Epic":     "PVTSSF_lAHOA8w2B84BSWWjzg_6Tts",
    "Priority": "PVTSSF_lAHOA8w2B84BSWWjzg_6Ttw",
    "Size":     "PVTSSF_lAHOA8w2B84BSWWjzg_6Tuc",
}
OPTIONS = {
    "Status":   {"Todo": "f75ad846", "In Progress": "47fc9ee4", "Done": "98236657"},
    "Epic":     {"auth": "07326740", "ui": "30eb05ce", "feature": "0102ea90", "infra": "3250204f", "process": "f2193706"},
    "Priority": {"P1": "7deb94d7", "P2": "c19c0974", "P3": "21c6c2c7"},
    "Size":     {"XS": "9858f8c0", "S": "9d13b782", "M": "67b3c930", "L": "bc1475ad"},
}

def graphql(query, variables=None):
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    result = subprocess.run(
        ["gh", "api", "graphql", "--input", "-"],
        input=json.dumps(payload), capture_output=True, text=True, env=env
    )
    if result.returncode != 0:
        return None
    resp = json.loads(result.stdout)
    if "errors" in resp:
        print(f"  GQL error: {resp['errors'][0]['message']}")
        return None
    return resp.get("data")

def set_field(item_id, field_name, option_name):
    field_id = FIELDS[field_name]
    option_id = OPTIONS[field_name].get(option_name)
    if not option_id:
        return False
    data = graphql("""
        mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
          updateProjectV2ItemFieldValue(input: {
            projectId: $projectId, itemId: $itemId,
            fieldId: $fieldId,
            value: { singleSelectOptionId: $optionId }
          }) { projectV2Item { id } }
        }
    """, {"projectId": PROJECT_ID, "itemId": item_id, "fieldId": field_id, "optionId": option_id})
    return data is not None

def get_all_items():
    """Получить все items проекта с labels и статусом issue."""
    items = []
    cursor = None
    while True:
        after = f', after: "{cursor}"' if cursor else ""
        data = graphql(f"""
        {{
          node(id: "{PROJECT_ID}") {{
            ... on ProjectV2 {{
              items(first: 50{after}) {{
                pageInfo {{ hasNextPage endCursor }}
                nodes {{
                  id
                  content {{
                    ... on Issue {{
                      number state
                      labels(first: 10) {{ nodes {{ name }} }}
                    }}
                  }}
                }}
              }}
            }}
          }}
        }}
        """)
        if not data:
            break
        page = data["node"]["items"]
        items.extend(page["nodes"])
        if not page["pageInfo"]["hasNextPage"]:
            break
        cursor = page["pageInfo"]["endCursor"]
    return items

def main():
    print("Загружаю все items из проекта...")
    items = get_all_items()
    print(f"Найдено: {len(items)} items")
    print()

    updated = 0
    for item in items:
        content = item.get("content", {})
        if not content or "number" not in content:
            continue

        item_id = item["id"]
        issue_num = content["number"]
        state = content.get("state", "OPEN")
        labels = [l["name"] for l in content.get("labels", {}).get("nodes", [])]

        # Определяем значения полей из labels
        epic = next((l.replace("epic:", "") for l in labels if l.startswith("epic:")), None)
        priority = next((l.replace("priority:", "") for l in labels if l.startswith("priority:")), None)
        size = next((l.replace("size:", "") for l in labels if l.startswith("size:")), None)

        # Status: Done для закрытых, In Progress для status:in-progress, иначе Todo
        if state == "CLOSED":
            status = "Done"
        elif "status:in-progress" in labels:
            status = "In Progress"
        else:
            status = "Todo"

        changes = []
        if epic and set_field(item_id, "Epic", epic):
            changes.append(f"Epic={epic}")
        if priority and set_field(item_id, "Priority", priority):
            changes.append(f"Priority={priority}")
        if size and set_field(item_id, "Size", size):
            changes.append(f"Size={size}")
        if set_field(item_id, "Status", status):
            changes.append(f"Status={status}")

        if changes:
            print(f"  #{issue_num} → {', '.join(changes)}")
            updated += 1

        time.sleep(0.1)  # rate limit

    print(f"\n✓ Обновлено {updated} issues")
    print(f"Открой: https://github.com/users/bon2362/projects/1")

if __name__ == "__main__":
    main()
