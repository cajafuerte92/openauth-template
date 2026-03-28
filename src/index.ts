import { issuer } from "@openauthjs/openauth";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";

// This value should be shared between the OpenAuth server Worker and other
// client Workers that you connect to it, so the types and schema validation are
// consistent.
const subjects = createSubjects({
  user: object({
    id: string(),
  }),
});

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // This top section is just for demo purposes. In a real setup another
    // application would redirect the user to this Worker to be authenticated,
    // and after signing in or registering the user would be redirected back to
    // the application they came from. In our demo setup there is no other
    // application, so this Worker needs to do the initial redirect and handle
    // the callback redirect on completion.
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response(renderHomePage(), {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
    } else if (url.pathname === "/callback") {
      return Response.json({
        message: "OAuth flow complete!",
        params: Object.fromEntries(url.searchParams.entries()),
      });
    }

    // The real OpenAuth server code starts here:
    return issuer({
      storage: CloudflareStorage({
        namespace: env.AUTH_STORAGE,
      }),
      subjects,
      providers: {
        password: PasswordProvider(
          PasswordUI({
            // eslint-disable-next-line @typescript-eslint/require-await
            sendCode: async (email, code) => {
              // This is where you would email the verification code to the
              // user, e.g. using Resend:
              // https://resend.com/docs/send-with-cloudflare-workers
              console.log(`Sending code ${code} to ${email}`);
            },
            copy: {
              input_code: "Code (check Worker logs)",
            },
          }),
        ),
      },
      theme: {
        title: "myAuth",
        primary: "#0051c3",
        favicon: "https://workers.cloudflare.com//favicon.ico",
        logo: {
          dark: "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/db1e5c92-d3a6-4ea9-3e72-155844211f00/public",
          light:
            "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/fa5a3023-7da9-466b-98a7-4ce01ee6c700/public",
        },
      },
      success: async (ctx, value) => {
        return ctx.subject("user", {
          id: await getOrCreateUser(env, value.email),
        });
      },
    }).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

async function getOrCreateUser(env: Env, email: string): Promise<string> {
  const result = await env.AUTH_DB.prepare(
    `
		INSERT INTO user (email)
		VALUES (?)
		ON CONFLICT (email) DO UPDATE SET email = email
		RETURNING id;
		`,
  )
    .bind(email)
    .first<{ id: string }>();
  if (!result) {
    throw new Error(`Unable to process user: ${email}`);
  }
  console.log(`Found or created user ${result.id} with email ${email}`);
  return result.id;
}


function renderHomePage(): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Recursos</title>
    <style>
      :root {
        color-scheme: light;
        --bg-start: #e8f1ff;
        --bg-end: #bed5ff;
        --card-bg: #ffffff;
        --text: #0f2f66;
        --accent: #2166d1;
        --accent-dark: #15489a;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Inter Tight", "Segoe UI", Roboto, Arial, sans-serif;
        background: linear-gradient(160deg, var(--bg-start), var(--bg-end));
        color: var(--text);
        display: grid;
        place-items: center;
        padding: 24px;
      }

      .card {
        width: min(720px, 100%);
        background: var(--card-bg);
        border-radius: 18px;
        padding: 28px;
        box-shadow: 0 18px 45px rgba(13, 46, 99, 0.16);
      }

      h1 {
        margin: 0 0 8px;
        color: var(--accent-dark);
        font-size: clamp(1.6rem, 3vw, 2.2rem);
      }

      p {
        margin: 0 0 18px;
      }

      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 12px;
      }

      a {
        display: block;
        text-decoration: none;
        color: var(--accent-dark);
        background: #f1f7ff;
        border: 1px solid rgba(33, 102, 209, 0.18);
        border-radius: 12px;
        padding: 14px 16px;
        font-weight: 600;
        transition: transform 0.15s ease, box-shadow 0.15s ease,
          background 0.15s ease;
      }

      a:hover,
      a:focus-visible {
        background: #dceaff;
        transform: translateY(-1px);
        box-shadow: 0 8px 18px rgba(33, 102, 209, 0.2);
        outline: none;
      }

      .url {
        display: block;
        margin-top: 4px;
        font-size: 0.9rem;
        opacity: 0.82;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Recursos</h1>
      <p>Accesos directos a tus servicios:</p>
      <ul>
        <li>
          <a href="https://cyberchef.rpingarronm.com" target="_blank" rel="noopener noreferrer">
            CyberChef
            <span class="url">cyberchef.rpingarronm.com</span>
          </a>
        </li>
        <li>
          <a href="https://jellyfin.rpingarronm.com" target="_blank" rel="noopener noreferrer">
            Jellyfin
            <span class="url">jellyfin.rpingarronm.com</span>
          </a>
        </li>
      </ul>
    </main>
  </body>
</html>`;
}
