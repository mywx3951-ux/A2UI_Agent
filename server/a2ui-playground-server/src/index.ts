import Koa from 'koa';
import Router from '@koa/router';
import cors from '@koa/cors';

const app = new Koa();
const router = new Router();

// TODO: 后续在此接入 a2ui agent（OpenAI）与 a2ui-server 协议生成及缓存
router.get('/health', (ctx) => {
  ctx.body = { status: 'ok' };
});

app.use(cors());
app.use(router.routes()).use(router.allowedMethods());

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`a2ui-playground-server listening on http://localhost:${port}`);
});
