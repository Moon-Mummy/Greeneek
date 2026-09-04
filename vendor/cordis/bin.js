#!/usr/bin/env node

import { Context } from '@greeneek/cordis'
import { pathToFileURL } from 'node:url'
import Loader from '@greeneek/cordis-plugin-loader'

const ctx = new Context()
ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'

await ctx.plugin(Loader)
await ctx.loader.create({
  name: '@greeneek/cordis-plugin-include',
  config: {
    path: './cordis.yml',
  },
})
