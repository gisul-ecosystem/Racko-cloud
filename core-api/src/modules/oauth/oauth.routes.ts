import { Router } from 'express';
import { oauthController } from './oauth.controller';

const router = Router();

/** Public OAuth2 token endpoint (client_credentials). */
router.post('/token', (req, res, next) => oauthController.token(req, res, next));

export default router;
