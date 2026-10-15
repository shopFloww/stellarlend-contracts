import request from 'supertest';

const healthCheck = jest.fn();
const deepHealthCheck = jest.fn();

jest.mock('../controllers/lending.controller', () => ({
  processHook: jest.fn(),
  getActivity: jest.fn(),
  deposit: jest.fn(),
  borrow: jest.fn(),
  repay: jest.fn(),
  withdraw: jest.fn(),
  healthCheck,
  deepHealthCheck,
}));

const app = require('../app').default;

describe('health route invariants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    healthCheck.mockImplementation(async (_req: any, res: any) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: '2024-01-01T00:00:00.000Z',
        services: { horizon: true, sorobanRpc: true },
      });
    });
    deepHealthCheck.mockImplementation(async (_req: any, res: any) => {
      res.status(200).json({ rpc: true, contract: true, ledger: 1234 });
    });
  });

  it('accepts only GET and HEAD for the shallow health endpoint', async () => {
    const res = await request(app).post('/api/health');

    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET, HEAD');
    expect(res.body).toEqual({
      status: 'error',
      code: 'method_not_allowed',
      message: 'Method not allowed on health endpoints',
    });
    expect(healthCheck).not.toHaveBeenCalled();
  });

  it('returns a deterministic 404 for unknown health subpaths', async () => {
    const res = await request(app).get('/api/health/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      status: 'error',
      code: 'health_route_not_found',
      message: 'Health endpoint not found',
    });
  });

  it('normalizes controller failures to a non-sensitive 503 payload', async () => {
    healthCheck.mockImplementation(async (_req: any, res: any) => {
      throw new Error('internal upstream outage');
    });

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: 'error',
      code: 'health_unavailable',
      message: 'Health check temporarily unavailable',
    });
  });

  it('keeps deep health checks deterministic across unhealthy and partial-failure states', async () => {
    deepHealthCheck.mockImplementation(async (_req: any, res: any) => {
      res.status(503).json({ rpc: true, contract: false, ledger: null });
    });

    const res = await request(app).get('/api/health/healthz');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ rpc: true, contract: false, ledger: null });
  });
});
