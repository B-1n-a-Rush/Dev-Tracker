(() => {
  const decoder = new TextDecoder('utf-8');
  const eocdSignature = 0x06054b50;
  const centralSignature = 0x02014b50;
  const localSignature = 0x04034b50;

  const uint16 = (view, offset) => view.getUint16(offset, true);
  const uint32 = (view, offset) => view.getUint32(offset, true);

  function findEndOfCentralDirectory(view) {
    const minimum = Math.max(0, view.byteLength - 65557);
    for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
      if (uint32(view, offset) === eocdSignature) return offset;
    }
    throw new Error('This ZIP file does not have a readable central directory.');
  }

  async function decompressEntry(bytes, method, expectedSize) {
    if (method === 0) return bytes.slice();
    if (method !== 8) throw new Error(`ZIP compression method ${method} is not supported.`);
    if (typeof DecompressionStream !== 'function') {
      throw new Error('This browser cannot decompress ZIP shapefiles. Upload GeoJSON instead.');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const result = new Uint8Array(await new Response(stream).arrayBuffer());
    if (expectedSize && result.byteLength !== expectedSize) {
      throw new Error('A file inside the ZIP did not decompress to its expected size.');
    }
    return result;
  }

  async function unzip(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const eocd = findEndOfCentralDirectory(view);
    const entryCount = uint16(view, eocd + 10);
    const centralOffset = uint32(view, eocd + 16);
    if (entryCount === 0xffff || centralOffset === 0xffffffff) {
      throw new Error('ZIP64 shapefiles are not supported. Recompress the route as a standard ZIP.');
    }
    const files = [];
    let offset = centralOffset;
    for (let index = 0; index < entryCount; index += 1) {
      if (uint32(view, offset) !== centralSignature) throw new Error('The ZIP central directory is damaged.');
      const method = uint16(view, offset + 10);
      const compressedSize = uint32(view, offset + 20);
      const uncompressedSize = uint32(view, offset + 24);
      const nameLength = uint16(view, offset + 28);
      const extraLength = uint16(view, offset + 30);
      const commentLength = uint16(view, offset + 32);
      const localOffset = uint32(view, offset + 42);
      const name = decoder.decode(new Uint8Array(arrayBuffer, offset + 46, nameLength)).replaceAll('\\', '/');
      offset += 46 + nameLength + extraLength + commentLength;
      if (name.endsWith('/')) continue;
      if (uint32(view, localOffset) !== localSignature) throw new Error(`The ZIP entry for ${name} is damaged.`);
      const localNameLength = uint16(view, localOffset + 26);
      const localExtraLength = uint16(view, localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = new Uint8Array(arrayBuffer, dataOffset, compressedSize);
      files.push({ name, bytes: await decompressEntry(compressed, method, uncompressedSize) });
    }
    return files;
  }

  function parsePolylineShapefile(bytes) {
    if (bytes.byteLength < 100) throw new Error('The .shp file is too short to contain a valid header.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getInt32(0, false) !== 9994) throw new Error('The .shp file has an invalid file code.');
    const headerShapeType = view.getInt32(32, true);
    if (![3, 13, 23, 0].includes(headerShapeType)) return [];
    const lines = [];
    let offset = 100;
    while (offset + 8 <= view.byteLength) {
      const contentBytes = view.getInt32(offset + 4, false) * 2;
      const start = offset + 8;
      const end = start + contentBytes;
      if (contentBytes < 4 || end > view.byteLength) throw new Error('A shapefile record is truncated.');
      const shapeType = view.getInt32(start, true);
      if ([3, 13, 23].includes(shapeType)) {
        if (contentBytes < 44) throw new Error('A polyline record is incomplete.');
        const partCount = view.getInt32(start + 36, true);
        const pointCount = view.getInt32(start + 40, true);
        const partsOffset = start + 44;
        const pointsOffset = partsOffset + partCount * 4;
        if (partCount < 1 || pointCount < 2 || pointsOffset + pointCount * 16 > end) {
          throw new Error('A polyline record has invalid part or point counts.');
        }
        const starts = [];
        for (let part = 0; part < partCount; part += 1) starts.push(view.getInt32(partsOffset + part * 4, true));
        starts.push(pointCount);
        for (let part = 0; part < partCount; part += 1) {
          const line = [];
          for (let point = starts[part]; point < starts[part + 1]; point += 1) {
            line.push([
              view.getFloat64(pointsOffset + point * 16, true),
              view.getFloat64(pointsOffset + point * 16 + 8, true)
            ]);
          }
          if (line.length > 1) lines.push(line);
        }
      }
      offset = end;
    }
    return lines;
  }

  function isLongitudeLatitude(lines) {
    return lines.every(line => line.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= -180 && x <= 180 && y >= -90 && y <= 90));
  }

  function isWebMercator(prj) {
    return /3857|pseudo[_ ]mercator|web[_ ]mercator|auxiliary[_ ]sphere/i.test(prj);
  }

  function projectLines(lines, projectionText) {
    if (isLongitudeLatitude(lines)) return lines;
    if (isWebMercator(projectionText)) {
      const radius = 6378137;
      return lines.map(line => line.map(([x, y]) => [
        x / radius * 180 / Math.PI,
        Math.atan(Math.sinh(y / radius)) * 180 / Math.PI
      ]));
    }
    throw new Error('This shapefile uses an unsupported projected coordinate system. Export it as WGS 84 (EPSG:4326) or GeoJSON and try again.');
  }

  function fileStem(name) {
    const base = name.slice(name.lastIndexOf('/') + 1);
    return base.replace(/\.[^.]+$/, '').toLowerCase();
  }

  async function parseZip(arrayBuffer) {
    const files = await unzip(arrayBuffer);
    const shapefiles = files.filter(file => /\.shp$/i.test(file.name));
    if (!shapefiles.length) throw new Error('The ZIP does not contain a .shp file.');
    const allLines = [];
    shapefiles.forEach(file => {
      const stem = fileStem(file.name);
      const projectionFile = files.find(candidate => /\.prj$/i.test(candidate.name) && fileStem(candidate.name) === stem);
      const projectionText = projectionFile ? decoder.decode(projectionFile.bytes) : '';
      allLines.push(...projectLines(parsePolylineShapefile(file.bytes), projectionText));
    });
    if (!allLines.length) throw new Error('No polyline route alignment was found in the shapefile ZIP.');
    return {
      type: 'FeatureCollection',
      features: allLines.map(coordinates => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }))
    };
  }

  globalThis.tracksideRouteFileParser = Object.freeze({ parseZip });
})();
