# Landing-page news & events (administrator-managed)

This update adds a restrained **News & events** bulletin beneath the BRACU Google sign-in section. It reads only published announcements and requires no visitor login. Before an administrator publishes anything, a neutral “No announcements published yet” message appears. No example notices or dates are presented as real events.

## Roles and permissions

| Action | Visitor | Student / Supervisor | Admin |
| --- | --- | --- | --- |
| Read published notices on landing page | Yes | Yes | Yes |
| Open internal announcements list | No | No | Yes |
| Create draft, publish, unpublish, archive | No | No | Yes |
| Manage announcements during read-only role preview | No | No | No; preview is read-only |

The backend checks the authenticated Google identity and role before allowing any editor action. Browser-supplied roles are ignored. The publicly accessible feed returns only title, description, category, date, location, optional HTTPS link, pin flag, identifier, and update time. It excludes authors, drafts, archived items, academic records, and permission data.

## How to publish

1. Log in with an administrator account.
2. Select **News & Events** in the left navigation.
3. Select **New**. Choose **Notice**, **Event**, **News**, or **Deadline**.
4. Add a title and description. Optionally set an event date, location, trusted HTTPS link, and **Feature this announcement first**.
5. Select **Save draft** to keep it private, or **Publish now** to make it visible on the public landing page.
6. Use **Edit**, **Unpublish**, or **Archive** on existing announcements. Archiving retains the record privately; there is no destructive delete action.

The landing page shows up to three cards by default, with an option to expand to six. Pinned notices appear first, then the most recently updated. The feed is cached briefly; updates may take around a minute or two to propagate.

## Storage and deployment

- News is stored in an **independent, private Google spreadsheet**, separate from the university Thesis Master and evaluation sheets.
- The first successful draft/publish automatically creates `BRACU Thesis Portal — Public Announcements`. Its spreadsheet ID is stored privately as the Apps Script property `ANNOUNCEMENTS_SHEET_ID`.
- You do **not** need to create a tab or add a new Cloudflare variable.
- To update an existing deployed portal, paste the updated **full** `backend/apps-script/Code.gs` into its Apps Script project. Select **Deploy → Manage deployments → Edit (pencil) → New version → Deploy**, preserving the existing web app URL.
- Then push the updated React/Cloudflare Pages project to the connected GitHub repository. Cloudflare Pages will build and publish the updated frontend and API.
- Until the Apps Script is redeployed, the new editor and public feed will return errors because the old gateway does not recognize announcement actions.
- For a new Apps Script authorization, Google may request consent to create/edit the new spreadsheet. Use the account that owns the deployed Apps Script project.

## Data hygiene

Published announcements are visible to anyone on the internet before signing in. Only post intended public information. Never put student names, IDs, marks, private supervisor comments, access tokens, or internal-only Google Sheet links in an announcement. Use an institutionally approved public URL for optional attachments.

Announcement requests are deliberately independent of the large `All student info` and `Group info` master lookups. This makes the editor more responsive, though a cold start of Apps Script or Google Sheets can still introduce some delay. The public feed and admin list show a loading state.
