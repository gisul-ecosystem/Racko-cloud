const db = require('../db/postgres');
const AppError = require('../utils/AppError');

const createCustomService = async ({
  name,
  description,
  category,
  pricePerUser,
  icon,
  createdBy
}) => {
  const result = await db.query(
    `
    INSERT INTO custom_services (name, description, category, price_per_user, icon, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `,
    [name, description, category || 'Custom', pricePerUser || 0, icon || 'custom', createdBy]
  );
  return result.rows[0];
};

const listCustomServices = async () => {
  const result = await db.query(`
    SELECT * FROM custom_services WHERE active = true ORDER BY created_at DESC
  `);
  return result.rows;
};

const updateCustomService = async (id, fields) => {
  const { name, description, category, pricePerUser, icon } = fields;
  const result = await db.query(
    `
    UPDATE custom_services
    SET name = COALESCE($1, name),
        description = COALESCE($2, description),
        category = COALESCE($3, category),
        price_per_user = COALESCE($4, price_per_user),
        icon = COALESCE($5, icon),
        updated_at = NOW()
    WHERE id = $6
    RETURNING *
  `,
    [name, description, category, pricePerUser, icon, id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Custom service not found', 404);
  }

  return result.rows[0];
};

const deleteCustomService = async (id) => {
  await db.query('UPDATE custom_services SET active = false WHERE id = $1', [id]);
};

const addCustomServiceToRequest = async (requestId, customServiceId, addedBy) => {
  const result = await db.query(
    `
    INSERT INTO request_custom_services (request_id, custom_service_id, added_by)
    VALUES ($1, $2, $3)
    ON CONFLICT (request_id, custom_service_id) DO NOTHING
    RETURNING *
  `,
    [requestId, customServiceId, addedBy]
  );
  return result.rows[0];
};

const removeCustomServiceFromRequest = async (requestId, customServiceId) => {
  await db.query(
    `
    DELETE FROM request_custom_services
    WHERE request_id = $1 AND custom_service_id = $2
  `,
    [requestId, customServiceId]
  );
};

const getCustomServicesForRequest = async (requestId) => {
  const result = await db.query(
    `
    SELECT cs.* FROM custom_services cs
    JOIN request_custom_services rcs ON rcs.custom_service_id = cs.id
    WHERE rcs.request_id = $1 AND cs.active = true
  `,
    [requestId]
  );
  return result.rows;
};

module.exports = {
  addCustomServiceToRequest,
  createCustomService,
  deleteCustomService,
  getCustomServicesForRequest,
  listCustomServices,
  removeCustomServiceFromRequest,
  updateCustomService
};
