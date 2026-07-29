#include <vulkan/vulkan.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define VK_CHECK(call) do { \
    const VkResult result = (call); \
    if (result != VK_SUCCESS) { \
        fprintf(stderr, "Vulkan error %d at line %d\n", result, __LINE__); \
        return 1; \
    } \
} while (0)

static int has_extension(const VkExtensionProperties * exts, uint32_t count, const char * name) {
    for (uint32_t i = 0; i < count; ++i) {
        if (strcmp(exts[i].extensionName, name) == 0) {
            return 1;
        }
    }
    return 0;
}

int main(void) {
    const VkApplicationInfo app = {
        .sType = VK_STRUCTURE_TYPE_APPLICATION_INFO,
        .pApplicationName = "llama-vulkan-capability-probe",
        .apiVersion = VK_API_VERSION_1_3,
    };
    const VkInstanceCreateInfo create = {
        .sType = VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO,
        .pApplicationInfo = &app,
    };

    VkInstance instance;
    VK_CHECK(vkCreateInstance(&create, NULL, &instance));

    uint32_t count = 0;
    VK_CHECK(vkEnumeratePhysicalDevices(instance, &count, NULL));
    VkPhysicalDevice * devices = calloc(count, sizeof(*devices));
    if (devices == NULL) {
        vkDestroyInstance(instance, NULL);
        return 1;
    }
    VK_CHECK(vkEnumeratePhysicalDevices(instance, &count, devices));
    printf("devices=%u\n", count);

    for (uint32_t i = 0; i < count; ++i) {
        VkPhysicalDeviceSubgroupProperties subgroup = {
            .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_SUBGROUP_PROPERTIES,
        };
        VkPhysicalDeviceVulkan12Properties props12 = {
            .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_2_PROPERTIES,
            .pNext = &subgroup,
        };
        VkPhysicalDeviceVulkan11Properties props11 = {
            .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_1_PROPERTIES,
            .pNext = &props12,
        };
        VkPhysicalDeviceProperties2 props = {
            .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_PROPERTIES_2,
            .pNext = &props11,
        };
        vkGetPhysicalDeviceProperties2(devices[i], &props);

        VkPhysicalDeviceShaderFloat16Int8Features fp16 = {
            .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_SHADER_FLOAT16_INT8_FEATURES,
        };
        VkPhysicalDeviceShaderIntegerDotProductFeatures dot = {
            .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_SHADER_INTEGER_DOT_PRODUCT_FEATURES,
            .pNext = &fp16,
        };
        VkPhysicalDeviceFeatures2 features = {
            .sType = VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_FEATURES_2,
            .pNext = &dot,
        };
        vkGetPhysicalDeviceFeatures2(devices[i], &features);

        VkPhysicalDeviceMemoryProperties memory;
        vkGetPhysicalDeviceMemoryProperties(devices[i], &memory);

        printf("device[%u]=%s vendor=0x%04x device=0x%04x api=%u.%u.%u driver=%u subgroup=%u fp16=%u int8=%u intdot=%u\n",
               i,
               props.properties.deviceName,
               props.properties.vendorID,
               props.properties.deviceID,
               VK_VERSION_MAJOR(props.properties.apiVersion),
               VK_VERSION_MINOR(props.properties.apiVersion),
               VK_VERSION_PATCH(props.properties.apiVersion),
               props.properties.driverVersion,
               subgroup.subgroupSize,
               fp16.shaderFloat16,
               fp16.shaderInt8,
               dot.shaderIntegerDotProduct);

        for (uint32_t heap = 0; heap < memory.memoryHeapCount; ++heap) {
            printf(" heap[%u]=%.2fGiB flags=0x%x\n",
                   heap,
                   (double) memory.memoryHeaps[heap].size / (1024.0 * 1024.0 * 1024.0),
                   memory.memoryHeaps[heap].flags);
        }

        uint32_t extension_count = 0;
        VK_CHECK(vkEnumerateDeviceExtensionProperties(devices[i], NULL, &extension_count, NULL));
        VkExtensionProperties * extensions = calloc(extension_count, sizeof(*extensions));
        if (extensions == NULL) {
            free(devices);
            vkDestroyInstance(instance, NULL);
            return 1;
        }
        VK_CHECK(vkEnumerateDeviceExtensionProperties(devices[i], NULL, &extension_count, extensions));

        const char * wanted[] = {
            "VK_KHR_shader_integer_dot_product",
            "VK_KHR_cooperative_matrix",
            "VK_NV_cooperative_matrix2",
            "VK_KHR_shader_float16_int8",
            "VK_EXT_subgroup_size_control",
            "VK_KHR_16bit_storage",
            "VK_KHR_8bit_storage",
        };
        for (size_t w = 0; w < sizeof(wanted) / sizeof(wanted[0]); ++w) {
            printf("  %s=%s\n", wanted[w], has_extension(extensions, extension_count, wanted[w]) ? "yes" : "no");
        }
        free(extensions);
    }

    free(devices);
    vkDestroyInstance(instance, NULL);
    return 0;
}
