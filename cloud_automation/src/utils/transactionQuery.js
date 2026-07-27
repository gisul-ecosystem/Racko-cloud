let savepointCounter = 0;

const isLeasedClient = (client) => typeof client?.release === 'function';

const runWithoutSavepoint = async (queryFn, fallback) => {
  try {
    return await queryFn();
  } catch (error) {
    if (error?.code === '42P01') {
      return fallback;
    }

    throw error;
  }
};

const optionalTableQuery = async (client, queryFn, fallback) => {
  if (!isLeasedClient(client)) {
    return runWithoutSavepoint(queryFn, fallback);
  }

  const savepoint = `sp_${++savepointCounter}`;

  try {
    await client.query(`SAVEPOINT ${savepoint}`);
  } catch (error) {
    if (error?.code === '25P01') {
      return runWithoutSavepoint(queryFn, fallback);
    }

    throw error;
  }

  try {
    const result = await queryFn();
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    return result;
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);

    if (error?.code === '42P01') {
      return fallback;
    }

    throw error;
  }
};

module.exports = {
  optionalTableQuery,
  isLeasedClient
};
