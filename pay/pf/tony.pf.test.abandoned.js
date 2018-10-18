(function(exports) {
	const argv=require('yargs').argv, debugout=require('debugout')(argv.debugout);;
/**
 * 生成ANSI-X9.9-MAC校验码
 * 所有的输入输出数据必须是16进制字符串
 * 密钥只能为16位长度的16进制字符串,否则将返回null
 * 初始向量为16为长度的16进制字符串,如果不符合条件,自动设置为"0000000000000000"
 * 原始数据,16进制表示的字符串
 * @param key	密钥
 * @param vector	初始向量
 * @param data	加密数据
 * @return	加密后的数据
 */
exports.MAC=function MAC(key,vector,data)
{
	if(key.length != 16)
	{
		throw new Error("key's length must be 16!");
	}
	
	if(vector == null || vector.length() != 16)
		vector = "0000000000000000";
	
	// var sb = Buffer.from(data, 'ascii');
	// var mod = data.length%16;
	// if(mod != 0)
	// {
	//     // for(var i = 0;i < 16 - mod;i++)
	//     // {
	//     //     sb.append("0");
	//     // }
	//     sb.fill('0', )
	// }
	
	var sb;
	var mod = data.length%16;
	if(mod)
	{
		sb=Buffer.alloc(data.length+16-mod, '0', 'ascii');
		sb.write(data, 'ascii');
	} else sb=Buffer.from(data);

	var operator = sb;

	//TODO
	debugout("补位后的操作数为：" + operator.toString());
	
	var count = operator.length/16;
	var blocks = new Array(count);
	
	for(var i = 0;i < count;i++)
	{
		blocks[i] = operator.slice(i*16, i*16 + 16);
	}
	
	//循环进行异或,DES加密
	for(var i = 0;i < count;i++)
	{
		var xor = xOrString(vector,blocks[i]);
		vector = DES_1(xor,key,0);
	}
	return vector;
}

function xOrString(pan,pin)
{
	if(pan.length != pin.length)
	{
		throw new Error("异或因子长度不一致");
	}
	
	var bytepan = pan;
	var bytepin = pin;
	
	var result = Buffer.allocUnsafe(bytepan.length);
	
	for(var i = 0;i < result.length;i++)
	{
		result [i] = (bytepan[i] ^ bytepin[i]);
	}
	
	//TODO
	//System.out.println("异或后的结果为：" + ByteUtil.getHexStr(result));
	return result;
}
/**
 * DES加解密 type 参数为0 表示加密，type 为1 表示解密
 * @param source 目标数据
 * @param key 密钥
 * @param type 加解密类型
 * @return 加加解密结果
 */
function DES_1(source,key,type)
{
	if(source.length != 16 || key.length != 16)
		return null;
	if(type==0)
	{
		return encryption(source, key);
	}
	if(type==1)
	{
		return discryption(source, key);
	}

	return null;
}
/**
 * 数据加密
 * @param D 被加密数据
 * @param K 加密密钥
 * @return 加密结果
 */
function encryption(D, K)
{
	var str = "";
	var temp = Buffer.allocUnsafe(64);
	int[] data = string2Binary(D);

	data = changeIP(data);
	int[][] left = new int[17][32];
	int[][] right = new int[17][32];

	for(int j=0; j<32; j++)
	{
		left[0][j] = data[j];
		right[0][j] = data[j+32];
	}

	setKey(K);
	for(int i=1; i<17; i++)
	{
		int[] key = subKey[i-1];
		left[i] = right[i-1];
		int[] fTemp = f(right[i-1],key);
		right[i] = diffOr(left[i-1],fTemp);
	}

	for(int i=0; i<32; i++)
	{
		temp[i] = right[16][i];
		temp[32+i] = left[16][i];
	}

	temp = changeInverseIP(temp);
	str = binary2ASC(intArr2Str(temp));

	return str;
}

})(module.exports);

