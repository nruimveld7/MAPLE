import adapter from '@sveltejs/adapter-node';

const base = process.env.BASE_PATH || '';

export default {
  kit: {
    adapter: adapter(),
    paths: {
      base
    }
  }
};
